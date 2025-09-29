# Project Directory Fix for Claude Terminal

## Problem
Both the Claude terminal interface and Claude Code instances were previously working in temporary directories (`/tmp/tmpth5hlmel`) instead of the actual project directory, causing issues with git operations like pushing to origin.

## Solution
Modified both the terminal server and Claude Code Manager to use the actual project directory as the working directory instead of creating isolated temporary session directories.

## Changes Made

### 1. Docker Compose Updates
- Added `PROJECT_ROOT_DIR` environment variable to both `docker-compose.yml` and `docker-compose.dev.yml`
- Added volume mount `${PWD}:/app/project` to mount the host project directory into the container

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
S
## Backward Compatibility

The system still falls back to session-specific directories if the project root directory is not found, ensuring compatibility with existing deployments.
