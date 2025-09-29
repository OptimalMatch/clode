# Automatic SSH Key Setup for Claude Code Instances

## Overview

Claude Code instances now automatically receive SSH key configuration, eliminating the need for users to manually ask Claude to copy SSH keys for git operations.

## How It Works

When a Claude Code instance is spawned, the system automatically:

1. **Copies SSH Keys**: All SSH keys from `/app/ssh_keys/` are copied to the instance's `~/.ssh/` directory
2. **Sets Proper Permissions**: 
   - Private keys: `600` (owner read/write only)
   - Public keys: `644` (owner read/write, others read)
3. **Creates SSH Config**: Generates `~/.ssh/config` with GitHub configuration
4. **Enables Git Operations**: Claude can immediately perform git clone, commit, and push operations

## SSH Configuration Generated

The system creates an SSH config file with:

```
Host github.com
    HostName github.com
    User git
    IdentitiesOnly yes
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    IdentityFile ~/.ssh/claude-workflow-manager8
```

## Benefits

- ✅ **Zero User Intervention**: No need to ask Claude to copy SSH keys
- ✅ **Immediate Git Access**: Git operations work from the first command
- ✅ **Secure**: Proper file permissions are automatically set
- ✅ **Reliable**: Consistent SSH setup across all instances

## Logging

The system provides detailed logging during SSH setup:

```
🔑 Setting up SSH keys for git operations...
📋 Copied SSH key: claude-workflow-manager8
📋 Copied SSH key: claude-workflow-manager8.pub
✅ SSH configuration created with 2 keys
✅ SSH keys configured successfully for instance [id]
```

## Fallback Behavior

If SSH key setup fails:
- The instance still spawns successfully
- A warning is logged: `⚠️ Failed to setup SSH keys (git operations may fail)`
- Users can still manually configure SSH if needed

## Implementation

The automatic setup is handled by the `_setup_ssh_keys_for_instance()` method in `ClaudeCodeManager`, which is called during instance spawning after Claude profile restoration.
