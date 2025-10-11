"""
File Editor Manager
Manages file operations for repositories including browsing, reading, writing, and change tracking
"""
import os
import shutil
import tempfile
import asyncio
import subprocess
import json
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from datetime import datetime
import difflib


class FileChange:
    """Represents a single file change"""
    def __init__(self, change_id: str, file_path: str, operation: str, 
                 old_content: Optional[str], new_content: Optional[str], 
                 timestamp: str, status: str = "pending", generate_diff: bool = True):
        self.change_id = change_id
        self.file_path = file_path
        self.operation = operation  # create, update, delete, move
        self.old_content = old_content
        self.new_content = new_content
        self.timestamp = timestamp
        self.status = status  # pending, approved, rejected, applied
        self.generate_diff = generate_diff
    
    def to_dict(self, include_diff: bool = True):
        result = {
            "change_id": self.change_id,
            "file_path": self.file_path,
            "operation": self.operation,
            "old_content": self.old_content,
            "new_content": self.new_content,
            "timestamp": self.timestamp,
            "status": self.status,
        }
        # Only generate diff if requested and it's an update operation
        if include_diff and self.generate_diff and self.operation == "update":
            result["diff"] = self._generate_diff()
        else:
            result["diff"] = None
        return result
    
    def _generate_diff(self) -> str:
        """Generate a unified diff between old and new content"""
        if not self.old_content or not self.new_content:
            return ""
        
        old_lines = self.old_content.splitlines(keepends=True)
        new_lines = self.new_content.splitlines(keepends=True)
        
        diff = difflib.unified_diff(
            old_lines, new_lines,
            fromfile=f"a/{self.file_path}",
            tofile=f"b/{self.file_path}",
            lineterm=''
        )
        return ''.join(diff)


class FileEditorManager:
    """
    Manages file operations for git repositories with change tracking and approval workflow
    """
    
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.changes: Dict[str, FileChange] = {}
        self.change_history: List[FileChange] = []
    
    def browse_directory(self, path: str = "", include_hidden: bool = False) -> Dict:
        """
        Browse a directory and return its structure
        
        Args:
            path: Relative path from repo root (empty string = root)
            include_hidden: Whether to include hidden files/directories
            
        Returns:
            Dictionary with directory structure
        """
        full_path = os.path.join(self.repo_path, path)
        
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Path does not exist: {path}")
        
        if not os.path.isdir(full_path):
            raise NotADirectoryError(f"Path is not a directory: {path}")
        
        items = []
        
        try:
            for item in sorted(os.listdir(full_path)):
                # Skip hidden files unless requested
                if not include_hidden and item.startswith('.'):
                    continue
                
                item_path = os.path.join(full_path, item)
                rel_path = os.path.join(path, item) if path else item
                # Normalize to forward slashes for cross-platform compatibility
                rel_path = rel_path.replace('\\', '/')
                
                is_dir = os.path.isdir(item_path)
                size = 0 if is_dir else os.path.getsize(item_path)
                
                items.append({
                    "name": item,
                    "path": rel_path,
                    "type": "directory" if is_dir else "file",
                    "size": size,
                    "modified": datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat()
                })
        except PermissionError:
            raise PermissionError(f"Permission denied accessing: {path}")
        
        return {
            "path": path,
            "items": items,
            "total": len(items)
        }
    
    def read_file(self, file_path: str) -> Dict:
        """
        Read a file's content
        
        Args:
            file_path: Relative path to the file from repo root
            
        Returns:
            Dictionary with file content and metadata
        """
        full_path = os.path.join(self.repo_path, file_path)
        
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File does not exist: {file_path}")
        
        if not os.path.isfile(full_path):
            raise IsADirectoryError(f"Path is a directory, not a file: {file_path}")
        
        try:
            # Try to read as text
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            is_binary = False
        except UnicodeDecodeError:
            # File is binary
            with open(full_path, 'rb') as f:
                content = f.read()
            is_binary = True
        
        return {
            "path": file_path,
            "content": content if not is_binary else None,
            "is_binary": is_binary,
            "size": os.path.getsize(full_path),
            "modified": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat()
        }
    
    def create_change(self, file_path: str, operation: str, 
                     new_content: Optional[str] = None,
                     old_path: Optional[str] = None,
                     generate_diff: bool = True) -> FileChange:
        """
        Create a new file change - applies immediately but tracks as pending for review/undo
        
        This follows the Cursor/Windsurf model where changes are applied immediately,
        then shown as "pending" for the user to approve (keep) or reject (undo).
        
        Args:
            file_path: Target file path
            operation: Operation type (create, update, delete, move)
            new_content: New content for the file
            old_path: Old path for move operations
            generate_diff: Whether to generate diff (can be disabled for performance)
            
        Returns:
            FileChange object
        """
        import uuid
        
        change_id = str(uuid.uuid4())
        full_path = os.path.join(self.repo_path, file_path)
        
        # Get old content if file exists (for potential undo)
        old_content = None
        if operation in ["update", "delete"] and os.path.exists(full_path):
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    old_content = f.read()
            except UnicodeDecodeError:
                old_content = None  # Binary file
        
        # **APPLY THE CHANGE IMMEDIATELY** (Cursor/Windsurf model)
        try:
            if operation == "create" or operation == "update":
                # Create parent directories if needed
                os.makedirs(os.path.dirname(full_path) if os.path.dirname(full_path) else self.repo_path, exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(new_content or "")
            
            elif operation == "delete":
                if os.path.exists(full_path):
                    os.remove(full_path)
        
        except Exception as e:
            # If application fails, raise error immediately
            raise RuntimeError(f"Failed to apply change: {str(e)}")
        
        # Track as "pending" for UI review/undo purposes
        change = FileChange(
            change_id=change_id,
            file_path=file_path,
            operation=operation,
            old_content=old_content,
            new_content=new_content,
            timestamp=datetime.utcnow().isoformat(),
            status="pending",  # Pending = shown in UI for review, can be undone
            generate_diff=generate_diff
        )
        
        self.changes[change_id] = change
        return change
    
    def get_changes(self, status: Optional[str] = None) -> List[Dict]:
        """Get all pending changes, optionally filtered by status"""
        changes = list(self.changes.values())
        
        if status:
            changes = [c for c in changes if c.status == status]
        
        return [c.to_dict() for c in changes]
    
    def approve_change(self, change_id: str) -> Dict:
        """
        Approve a change - marks as approved (change already applied)
        
        In the Cursor/Windsurf model, changes are already applied to the file.
        Approving just confirms the user wants to keep the change.
        """
        if change_id not in self.changes:
            raise ValueError(f"Change not found: {change_id}")
        
        change = self.changes[change_id]
        
        if change.status != "pending":
            raise ValueError(f"Change already {change.status}")
        
        # Change is already applied to file - just mark as approved
        change.status = "approved"
        self.change_history.append(change)
        del self.changes[change_id]
        
        return {"success": True, "message": "Change approved (already applied)"}
    
    def reject_change(self, change_id: str) -> Dict:
        """
        Reject a pending change - undoes the change that was already applied
        
        In the Cursor/Windsurf model, rejecting means reverting the file
        to its state before this change was applied.
        """
        if change_id not in self.changes:
            raise ValueError(f"Change not found: {change_id}")
        
        change = self.changes[change_id]
        full_path = os.path.join(self.repo_path, change.file_path)
        
        try:
            # Undo the change by restoring the old content
            if change.operation == "create":
                # Remove the created file
                if os.path.exists(full_path):
                    os.remove(full_path)
            
            elif change.operation == "update":
                # Restore old content
                if change.old_content is not None:
                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(change.old_content)
                else:
                    # No old content (binary file?) - just log warning
                    print(f"Warning: Cannot restore old content for {change.file_path}")
            
            elif change.operation == "delete":
                # Restore deleted file
                if change.old_content is not None:
                    os.makedirs(os.path.dirname(full_path) if os.path.dirname(full_path) else self.repo_path, exist_ok=True)
                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(change.old_content)
            
            change.status = "rejected"
            self.change_history.append(change)
            del self.changes[change_id]
            
            return {"success": True, "message": "Change rejected and reverted"}
        
        except Exception as e:
            return {"success": False, "error": f"Failed to revert change: {str(e)}"}
    
    def rollback_change(self, change_id: str) -> Dict:
        """Rollback a previously applied change"""
        # Find change in history
        change = None
        for hist_change in self.change_history:
            if hist_change.change_id == change_id and hist_change.status == "approved":
                change = hist_change
                break
        
        if not change:
            raise ValueError(f"Applied change not found: {change_id}")
        
        full_path = os.path.join(self.repo_path, change.file_path)
        
        try:
            if change.operation == "create":
                # Remove created file
                if os.path.exists(full_path):
                    os.remove(full_path)
            
            elif change.operation == "update":
                # Restore old content
                if change.old_content is not None:
                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(change.old_content)
            
            elif change.operation == "delete":
                # Restore deleted file
                if change.old_content is not None:
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(change.old_content)
            
            return {"success": True, "message": "Change rolled back successfully"}
        
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def create_directory(self, dir_path: str) -> Dict:
        """Create a new directory"""
        full_path = os.path.join(self.repo_path, dir_path)
        
        try:
            os.makedirs(full_path, exist_ok=True)
            return {"success": True, "path": dir_path}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def move_file(self, old_path: str, new_path: str) -> Dict:
        """Move/rename a file or directory"""
        old_full_path = os.path.join(self.repo_path, old_path)
        new_full_path = os.path.join(self.repo_path, new_path)
        
        if not os.path.exists(old_full_path):
            return {"success": False, "error": f"Source path does not exist: {old_path}"}
        
        try:
            # Create parent directories if needed
            os.makedirs(os.path.dirname(new_full_path), exist_ok=True)
            shutil.move(old_full_path, new_full_path)
            return {"success": True, "old_path": old_path, "new_path": new_path}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def search_files(self, query: str, path: str = "", case_sensitive: bool = False) -> List[Dict]:
        """
        Search for files by name pattern
        
        Args:
            query: Search query (supports wildcards)
            path: Directory to search in (empty = root)
            case_sensitive: Whether search is case-sensitive
            
        Returns:
            List of matching files with metadata
        """
        import fnmatch
        
        search_path = os.path.join(self.repo_path, path)
        matches = []
        
        if not case_sensitive:
            query = query.lower()
        
        for root, dirs, files in os.walk(search_path):
            for filename in files:
                compare_name = filename if case_sensitive else filename.lower()
                
                if fnmatch.fnmatch(compare_name, f"*{query}*"):
                    full_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(full_path, self.repo_path)
                    # Normalize to forward slashes for cross-platform compatibility
                    rel_path = rel_path.replace('\\', '/')
                    
                    matches.append({
                        "name": filename,
                        "path": rel_path,
                        "size": os.path.getsize(full_path),
                        "modified": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat()
                    })
        
        return matches
    
    def get_file_history(self, file_path: str, max_entries: int = 20) -> List[Dict]:
        """
        Get git history for a file
        
        Args:
            file_path: File path relative to repo root
            max_entries: Maximum number of history entries
            
        Returns:
            List of commit history entries
        """
        full_path = os.path.join(self.repo_path, file_path)
        
        try:
            result = subprocess.run(
                ["git", "log", f"-{max_entries}", "--format=%H|%an|%ae|%at|%s", "--", file_path],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True
            )
            
            history = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    commit_hash, author, email, timestamp, message = line.split('|', 4)
                    history.append({
                        "commit": commit_hash,
                        "author": author,
                        "email": email,
                        "timestamp": datetime.fromtimestamp(int(timestamp)).isoformat(),
                        "message": message
                    })
            
            return history
        except subprocess.CalledProcessError:
            return []
    
    def get_tree_structure(self, path: str = "", max_depth: int = 3, current_depth: int = 0) -> Dict:
        """
        Get hierarchical tree structure of directory
        
        Args:
            path: Starting path
            max_depth: Maximum depth to traverse
            current_depth: Current recursion depth
            
        Returns:
            Nested tree structure
        """
        if current_depth >= max_depth:
            return None
        
        full_path = os.path.join(self.repo_path, path)
        
        if not os.path.isdir(full_path):
            return None
        
        items = []
        
        try:
            for item in sorted(os.listdir(full_path)):
                if item.startswith('.'):
                    continue
                
                item_path = os.path.join(full_path, item)
                rel_path = os.path.join(path, item) if path else item
                # Normalize to forward slashes for cross-platform compatibility
                rel_path = rel_path.replace('\\', '/')
                is_dir = os.path.isdir(item_path)
                
                node = {
                    "name": item,
                    "path": rel_path,
                    "type": "directory" if is_dir else "file"
                }
                
                if is_dir and current_depth < max_depth - 1:
                    children = self.get_tree_structure(rel_path, max_depth, current_depth + 1)
                    if children:
                        node["children"] = children.get("items", [])
                
                items.append(node)
        except PermissionError:
            pass
        
        return {
            "path": path,
            "items": items
        }

