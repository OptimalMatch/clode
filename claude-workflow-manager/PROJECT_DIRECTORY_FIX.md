# Project Directory Fix for Claude Terminal

## Problem
Both the Claude terminal interface and Claude Code instances were previously working in temporary directories (`/tmp/tmpth5hlmel`) instead of the actual project directory, causing issues with git operations like pushing to origin.

## Solution
Modified both the terminal server and Claude Code Manager to use the actual project directory as the working directory instead of creating isolated temporary session directories.

## Changes Made

### 1. Docker Compose Updates
- Added `PROJECT_ROOT_DIR` environment variable to both `docker-compose.yml` and `docker-compose.dev.yml`
- Added volume mount `${PWD}/..:/app/project` to mount the host project directory into the container
- **Important**: Uses `${PWD}/..` because docker-compose runs from the `claude-workflow-manager` subdirectory, but the `.git` directory is at the repository root

### 2. Terminal Server Updates
- Added `self.project_root_dir` configuration option (defaults to `/app/project`)
- Modified `_initialize_terminal_session()` to use the project root directory instead of creating temporary session directories
- Added fallback to session-specific directories if project root doesn't exist
- Enhanced logging to show which directory is being used

### 3. Claude Code Manager Updates
- Added `self.project_root_dir` configuration option (defaults to `/app/project`)
- Modified `spawn_instance()` method to use existing project directory when available
- Added git repository verification to ensure the project directory contains the expected repository
- Falls back to temporary directory cloning if project directory doesn't exist or isn't the right repository
- Updated all references from `temp_dir` to `working_dir` throughout the codebase

### 4. Backend Container Updates  
- Added `PROJECT_ROOT_DIR` environment variable to backend container
- Added volume mount `${PWD}:/app/project` to both docker-compose files
- Updated backend Dockerfile to create `/app/project` directory

### 5. Dockerfile Updates
- Created `/app/project` directory in both terminal and backend containers
- Set proper permissions for the project directory

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT_DIR` | `/app/project` | Path to the project directory inside the container |

## Usage

### Development
```bash
cd claude-workflow-manager
docker-compose -f docker-compose.dev.yml up --build claude-terminal
```

### Production
```bash
cd claude-workflow-manager
docker-compose up --build claude-terminal
```

## Benefits

1. **Real Git Operations**: Claude can now perform actual git operations on the real repository
2. **File Persistence**: Changes made by Claude persist in the actual project files
3. **SSH Key Access**: Git operations can use the host's SSH keys for authentication
4. **No Temporary Directories**: No more confusion with temporary directories that don't contain the real project

## Testing

After rebuilding and restarting the containers, Claude should now:
- Start in the actual project directory (both terminal sessions and Claude Code instances)
- Have access to the real git repository
- Be able to push changes to origin (assuming proper SSH/auth setup)
- Work with actual project files instead of copies
- Show working directory as `/app/project` instead of temporary directories like `/tmp/tmpXXXXXX`

## Troubleshooting

### Issue: "Project directory /app/project is not a git repository"

This error indicates that the volume mount isn't working correctly. Here are the debugging steps:

1. **Check the containers are using the updated configuration:**
   ```bash
   docker-compose down
   docker-compose up --build
   ```

2. **Verify the volume mount is working:**
   ```bash
   # Check if the project directory is mounted correctly
   docker exec -it claude-workflow-backend ls -la /app/project
   
   # Should show your project files, not an empty directory
   ```

3. **Check the logs for debugging information:**
   ```bash
   docker logs claude-workflow-backend
   ```
   Look for lines like:
   ```
   🔧 ClaudeCodeManager initialized:
      Project root directory: /app/project
      Project directory exists: True
   ```

4. **Manual verification inside container:**
   ```bash
   docker exec -it claude-workflow-backend bash
   ls -la /app/project
   pwd
   cd /app/project && git status
   ```

### Issue: Volume mount not working on Windows

If you're on Windows, make sure:
- Docker Desktop is running
- The current directory (`${PWD}`) is being resolved correctly
- Try using the full path instead of `${PWD}/..`:
  ```yaml
  volumes:
    - C:/path/to/your/project:/app/project  # Point to the repository root, not claude-workflow-manager
  ```

### Issue: Wrong directory mounted

If you see project files but no `.git` directory, check:
- The volume mount should point to the repository root (where `.git` exists)
- If running docker-compose from `claude-workflow-manager/`, use `${PWD}/..:/app/project`
- If running from repository root, use `${PWD}:/app/project`

## Backward Compatibility

The system still falls back to temporary directories and cloning if the project root directory is not found, ensuring compatibility with existing deployments.
