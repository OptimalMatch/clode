"""
Claude File Manager - Handles restoration and management of ~/.claude files for different auth profiles
"""
import os
import json
import base64
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Optional, List
from datetime import datetime
import uuid

class ClaudeFileManager:
    def __init__(self, db):
        self.db = db
        self.base_claude_dir = Path.home() / ".claude"
        
    async def restore_claude_files(self, profile_id: str, target_dir: Optional[str] = None) -> bool:
        """
        Restore Claude authentication files from a stored profile to the filesystem.
        
        Args:
            profile_id: The ID of the Claude auth profile to restore
            target_dir: Optional custom directory (defaults to ~/.claude)
            
        Returns:
            bool: True if restoration was successful
        """
        try:
            # Get the profile from database
            profile = await self.db.get_claude_auth_profile(profile_id)
            if not profile:
                print(f"❌ Claude profile {profile_id} not found")
                return False
            
            # Determine target directory
            claude_dir = Path(target_dir) if target_dir else self.base_claude_dir
            claude_dir.mkdir(parents=True, exist_ok=True)
            
            print(f"🔧 Restoring Claude files for profile: {profile.profile_name}")
            print(f"📁 Target directory: {claude_dir}")
            
            # Restore credentials.json
            if profile.credentials_json:
                credentials_file = claude_dir / "credentials.json"
                
                # Decode the credentials (assuming it's base64 encoded for security)
                try:
                    if profile.credentials_json.startswith('eyJ'):  # Likely base64 JSON
                        credentials_content = base64.b64decode(profile.credentials_json).decode('utf-8')
                    else:
                        credentials_content = profile.credentials_json
                    
                    with open(credentials_file, 'w') as f:
                        f.write(credentials_content)
                    
                    print(f"✅ Restored credentials.json")
                    
                except Exception as e:
                    print(f"⚠️ Error restoring credentials.json: {e}")
                    # Create a placeholder credentials file
                    placeholder_creds = {
                        "profile_name": profile.profile_name,
                        "auth_method": profile.auth_method,
                        "restored_at": datetime.utcnow().isoformat(),
                        "profile_id": profile_id
                    }
                    with open(credentials_file, 'w') as f:
                        json.dump(placeholder_creds, f, indent=2)
            
            # Restore project files
            if profile.project_files:
                projects_dir = claude_dir / "projects"
                projects_dir.mkdir(exist_ok=True)
                
                for filename, content in profile.project_files.items():
                    try:
                        project_file = projects_dir / filename
                        
                        # Decode base64 content
                        if content:
                            decoded_content = base64.b64decode(content).decode('utf-8')
                            with open(project_file, 'w') as f:
                                f.write(decoded_content)
                            print(f"✅ Restored project file: {filename}")
                        
                    except Exception as e:
                        print(f"⚠️ Error restoring project file {filename}: {e}")
            
            # Update last used timestamp
            await self.db.set_profile_last_used(profile_id)
            
            print(f"🎉 Claude profile '{profile.profile_name}' restored successfully")
            return True
            
        except Exception as e:
            print(f"❌ Failed to restore Claude files: {e}")
            return False
    
    async def backup_claude_files(self, profile_id: str, source_dir: Optional[str] = None) -> bool:
        """
        Backup current Claude files to a profile in the database.
        
        Args:
            profile_id: The ID of the Claude auth profile to update
            source_dir: Optional custom source directory (defaults to ~/.claude)
            
        Returns:
            bool: True if backup was successful
        """
        try:
            profile = await self.db.get_claude_auth_profile(profile_id)
            if not profile:
                print(f"❌ Claude profile {profile_id} not found")
                return False
            
            # Determine source directory
            claude_dir = Path(source_dir) if source_dir else self.base_claude_dir
            
            if not claude_dir.exists():
                print(f"❌ Claude directory not found: {claude_dir}")
                return False
            
            print(f"💾 Backing up Claude files from: {claude_dir}")
            
            updates = {}
            
            # Backup credentials.json
            credentials_file = claude_dir / "credentials.json"
            if credentials_file.exists():
                with open(credentials_file, 'r') as f:
                    credentials_content = f.read()
                # Encode as base64 for security
                updates["credentials_json"] = base64.b64encode(credentials_content.encode('utf-8')).decode('utf-8')
                print("✅ Backed up credentials.json")
            
            # Backup project files
            projects_dir = claude_dir / "projects"
            if projects_dir.exists():
                project_files = {}
                for project_file in projects_dir.iterdir():
                    if project_file.is_file():
                        with open(project_file, 'r') as f:
                            content = f.read()
                        # Encode as base64
                        project_files[project_file.name] = base64.b64encode(content.encode('utf-8')).decode('utf-8')
                        print(f"✅ Backed up project file: {project_file.name}")
                
                updates["project_files"] = project_files
            
            # Update the profile in database
            if updates:
                success = await self.db.update_claude_auth_profile(profile_id, updates)
                if success:
                    print(f"🎉 Claude files backed up to profile '{profile.profile_name}'")
                    return True
                else:
                    print(f"❌ Failed to save backup to database")
                    return False
            else:
                print("⚠️ No Claude files found to backup")
                return False
                
        except Exception as e:
            print(f"❌ Failed to backup Claude files: {e}")
            return False
    
    async def create_isolated_claude_env(self, profile_id: str) -> Optional[str]:
        """
        Create an isolated Claude environment for a specific profile.
        Returns the path to the isolated .claude directory.
        
        Args:
            profile_id: The ID of the Claude auth profile
            
        Returns:
            str: Path to the isolated .claude directory, or None if failed
        """
        try:
            profile = await self.db.get_claude_auth_profile(profile_id)
            if not profile:
                print(f"❌ Claude profile {profile_id} not found")
                return None
            
            # Create isolated directory
            isolated_dir = Path(tempfile.mkdtemp(prefix=f"claude-{profile_id[:8]}-"))
            claude_env_dir = isolated_dir / ".claude"
            
            # Restore files to isolated directory
            success = await self.restore_claude_files(profile_id, str(claude_env_dir))
            if not success:
                # Clean up on failure
                shutil.rmtree(isolated_dir, ignore_errors=True)
                return None
            
            print(f"🔒 Created isolated Claude environment: {claude_env_dir}")
            return str(claude_env_dir)
            
        except Exception as e:
            print(f"❌ Failed to create isolated Claude environment: {e}")
            return None
    
    async def cleanup_isolated_env(self, claude_env_path: str) -> bool:
        """
        Clean up an isolated Claude environment.
        
        Args:
            claude_env_path: Path to the isolated .claude directory
            
        Returns:
            bool: True if cleanup was successful
        """
        try:
            claude_dir = Path(claude_env_path)
            if claude_dir.exists():
                # Remove the parent temp directory
                temp_dir = claude_dir.parent
                shutil.rmtree(temp_dir, ignore_errors=True)
                print(f"🧹 Cleaned up isolated Claude environment: {claude_env_path}")
                return True
            return False
        except Exception as e:
            print(f"⚠️ Error cleaning up isolated environment: {e}")
            return False
    
    def get_default_claude_dir(self) -> str:
        """Get the default Claude directory path."""
        return str(self.base_claude_dir)
    
    async def list_profile_files(self, profile_id: str) -> Dict[str, List[str]]:
        """
        List the files stored in a Claude auth profile.
        
        Args:
            profile_id: The ID of the Claude auth profile
            
        Returns:
            dict: Contains 'credentials' and 'project_files' lists
        """
        try:
            profile = await self.db.get_claude_auth_profile(profile_id)
            if not profile:
                return {"credentials": [], "project_files": []}
            
            result = {
                "credentials": ["credentials.json"] if profile.credentials_json else [],
                "project_files": list(profile.project_files.keys()) if profile.project_files else []
            }
            
            return result
            
        except Exception as e:
            print(f"❌ Failed to list profile files: {e}")
            return {"credentials": [], "project_files": []}
