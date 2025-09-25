"""
Claude Profile Manager - Handles isolated Claude authentication profiles for terminal sessions
"""
import os
import json
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Optional, List
import logging

logger = logging.getLogger(__name__)

class ClaudeProfileManager:
    """Manages isolated Claude authentication profiles for multi-user terminal sessions"""
    
    def __init__(self, profiles_dir: str = "/app/claude_profiles"):
        self.profiles_dir = Path(profiles_dir)
        self.profiles_dir.mkdir(exist_ok=True, parents=True)
        
        # Ensure proper permissions
        os.chmod(self.profiles_dir, 0o755)
        
        logger.info(f"📁 Claude Profile Manager initialized with directory: {self.profiles_dir}")
    
    def create_profile(self, profile_id: str, profile_name: str) -> Path:
        """Create a new isolated Claude profile directory"""
        profile_path = self.profiles_dir / profile_id
        profile_path.mkdir(exist_ok=True, parents=True)
        
        # Create .claude subdirectory for authentication files
        claude_dir = profile_path / ".claude"
        claude_dir.mkdir(exist_ok=True, parents=True)
        
        # Set proper permissions
        os.chmod(profile_path, 0o700)  # Owner only
        os.chmod(claude_dir, 0o700)    # Owner only
        
        # Create profile metadata
        metadata = {
            "profile_id": profile_id,
            "profile_name": profile_name,
            "created_at": str(Path().ctime()),
            "claude_home": str(claude_dir),
            "last_used": None
        }
        
        metadata_file = profile_path / "profile.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"✅ Created Claude profile: {profile_name} ({profile_id})")
        logger.info(f"📁 Profile directory: {profile_path}")
        logger.info(f"🔐 Claude auth directory: {claude_dir}")
        
        return claude_dir
    
    def get_profile_claude_home(self, profile_id: str) -> Optional[Path]:
        """Get the .claude directory path for a profile"""
        profile_path = self.profiles_dir / profile_id
        if not profile_path.exists():
            logger.warning(f"❌ Profile {profile_id} not found")
            return None
        
        claude_dir = profile_path / ".claude"
        if not claude_dir.exists():
            logger.warning(f"❌ .claude directory not found for profile {profile_id}")
            return None
        
        return claude_dir
    
    def setup_profile_environment(self, profile_id: str) -> Dict[str, str]:
        """Setup environment variables for a specific profile"""
        claude_home = self.get_profile_claude_home(profile_id)
        if not claude_home:
            raise ValueError(f"Profile {profile_id} not found or invalid")
        
        # Create environment with isolated CLAUDE_HOME
        env = os.environ.copy()
        env['CLAUDE_HOME'] = str(claude_home)
        env['HOME'] = str(claude_home.parent)  # Set HOME to profile directory
        
        # Update last used timestamp
        self._update_profile_last_used(profile_id)
        
        logger.info(f"🔧 Environment setup for profile {profile_id}")
        logger.info(f"   CLAUDE_HOME: {claude_home}")
        logger.info(f"   HOME: {claude_home.parent}")
        
        return env
    
    def _update_profile_last_used(self, profile_id: str):
        """Update the last used timestamp for a profile"""
        profile_path = self.profiles_dir / profile_id
        metadata_file = profile_path / "profile.json"
        
        if metadata_file.exists():
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                metadata['last_used'] = str(Path().ctime())
                
                with open(metadata_file, 'w') as f:
                    json.dump(metadata, f, indent=2)
                    
            except Exception as e:
                logger.warning(f"⚠️ Failed to update last used timestamp: {e}")
    
    def list_profiles(self) -> List[Dict[str, any]]:
        """List all available profiles"""
        profiles = []
        
        for profile_dir in self.profiles_dir.iterdir():
            if profile_dir.is_dir():
                metadata_file = profile_dir / "profile.json"
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                        profiles.append(metadata)
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to read profile metadata for {profile_dir}: {e}")
        
        return sorted(profiles, key=lambda x: x.get('last_used', ''), reverse=True)
    
    def delete_profile(self, profile_id: str) -> bool:
        """Delete a profile and all its data"""
        profile_path = self.profiles_dir / profile_id
        
        if not profile_path.exists():
            logger.warning(f"❌ Profile {profile_id} not found")
            return False
        
        try:
            shutil.rmtree(profile_path)
            logger.info(f"🗑️ Deleted profile {profile_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to delete profile {profile_id}: {e}")
            return False
    
    def backup_profile_credentials(self, profile_id: str) -> Optional[Dict[str, any]]:
        """Backup the Claude credentials from a profile"""
        claude_home = self.get_profile_claude_home(profile_id)
        if not claude_home:
            return None
        
        credentials = {}
        
        # Common Claude authentication files
        auth_files = [
            'auth.json',
            'session.json',
            'config.json',
            'cookies.json'
        ]
        
        for auth_file in auth_files:
            file_path = claude_home / auth_file
            if file_path.exists():
                try:
                    with open(file_path, 'r') as f:
                        credentials[auth_file] = json.load(f)
                except Exception as e:
                    logger.warning(f"⚠️ Failed to read {auth_file}: {e}")
        
        logger.info(f"💾 Backed up credentials for profile {profile_id}")
        return credentials
    
    def restore_profile_credentials(self, profile_id: str, credentials: Dict[str, any]) -> bool:
        """Restore Claude credentials to a profile"""
        claude_home = self.get_profile_claude_home(profile_id)
        if not claude_home:
            return False
        
        try:
            for filename, data in credentials.items():
                file_path = claude_home / filename
                with open(file_path, 'w') as f:
                    json.dump(data, f, indent=2)
                
                # Set restrictive permissions on auth files
                os.chmod(file_path, 0o600)
            
            logger.info(f"🔄 Restored credentials for profile {profile_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to restore credentials for profile {profile_id}: {e}")
            return False
    
    def get_profile_info(self, profile_id: str) -> Optional[Dict[str, any]]:
        """Get detailed information about a profile"""
        profile_path = self.profiles_dir / profile_id
        metadata_file = profile_path / "profile.json"
        
        if not metadata_file.exists():
            return None
        
        try:
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
            
            # Add additional runtime info
            claude_home = self.get_profile_claude_home(profile_id)
            if claude_home:
                auth_files = []
                for auth_file in claude_home.iterdir():
                    if auth_file.is_file():
                        auth_files.append({
                            'name': auth_file.name,
                            'size': auth_file.stat().st_size,
                            'modified': str(auth_file.stat().st_mtime)
                        })
                
                metadata['auth_files'] = auth_files
                metadata['total_size'] = sum(f['size'] for f in auth_files)
            
            return metadata
            
        except Exception as e:
            logger.error(f"❌ Failed to get profile info for {profile_id}: {e}")
            return None
