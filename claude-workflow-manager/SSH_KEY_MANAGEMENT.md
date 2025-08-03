# SSH Key Management for Git Repositories

## 🎯 **Feature Overview**

Added comprehensive SSH key management to the Claude Workflow Manager, enabling users to generate, manage, and use SSH keys for accessing private Git repositories seamlessly.

## ✨ **New Capabilities**

### **1. Automated SSH Key Generation**
- **One-click SSH key generation** with support for ED25519 and RSA key types
- **Secure server-side storage** with proper file permissions (600 for private keys)
- **Automatic fingerprint calculation** for key identification
- **Email association** for better key management

### **2. Intelligent Git Repository Validation**
- **Real-time repository validation** with SSH and HTTPS support
- **Smart error detection** for authentication and permission issues
- **Automatic SSH URL suggestions** when HTTPS authentication fails
- **Contextual SSH key setup prompts**

### **3. Interactive SSH Key Management**
- **Step-by-step guided process** for SSH key generation and setup
- **Visual instructions** for adding keys to GitHub, GitLab, Bitbucket
- **SSH connection testing** to verify key authentication
- **Key listing and management** with creation dates and fingerprints

### **4. Seamless Integration**
- **Integrated into workflow creation** modal with smart error handling
- **Automatic repository re-validation** after SSH key generation
- **Support for both HTTPS and SSH Git URLs**
- **Fallback mechanisms** for different authentication methods

## 🔧 **Backend Implementation**

### **New API Endpoints**

#### **POST /api/ssh/generate-key**
```typescript
// Generate new SSH key pair
{
  "key_name": "claude-workflow-manager", 
  "key_type": "ed25519",           // or "rsa"
  "email": "user@example.com"      // optional
}

// Response includes public key, private key, fingerprint, and setup instructions
```

#### **GET /api/ssh/keys**
```typescript
// List all SSH keys with metadata
{
  "keys": [
    {
      "fingerprint": "SHA256:...",
      "key_name": "claude-workflow-manager",
      "public_key": "ssh-ed25519 AAAA...",
      "created_at": "2024-01-15T10:30:00Z",
      "last_used": null
    }
  ]
}
```

#### **POST /api/ssh/test-connection**
```typescript
// Test SSH connection to Git repository
{
  "git_repo": "git@github.com:user/repo.git",
  "use_ssh_agent": true
}

// Response includes success status and detailed message
```

#### **DELETE /api/ssh/keys/{key_name}**
```typescript
// Delete SSH key pair from server
// Returns success confirmation
```

### **Security Features**
- **Proper file permissions** (600 for private keys, 644 for public keys)
- **SSH directory creation** with secure permissions (700)
- **Key uniqueness validation** to prevent overwrites
- **Secure temporary file handling** during generation
- **No plaintext storage** of sensitive data in logs

### **Git Provider Support**
- **GitHub** - Full SSH authentication testing
- **GitLab** - Compatible SSH key format and testing
- **Bitbucket** - Standard SSH authentication support
- **Generic Git** - Works with any Git provider supporting SSH

## 🎨 **Frontend Implementation**

### **SSHKeyManager Component**
A comprehensive React component with:

#### **Step 1: Key Generation**
- **Key name input** with validation
- **Key type selection** (ED25519 recommended, RSA for compatibility)
- **Optional email association**
- **Real-time generation with progress indicators**

#### **Step 2: Setup & Instructions**
- **Public key display** with copy-to-clipboard functionality
- **Provider-specific instructions** for GitHub, GitLab, Bitbucket
- **SSH connection testing** with the target repository
- **Visual feedback** for successful/failed connections

#### **Step 3: Key Management**
- **List all existing keys** with metadata
- **Copy public keys** to clipboard
- **Delete unwanted keys** with confirmation
- **Refresh key list** functionality

### **Enhanced Workflow Creation**
- **Smart error detection** in Git validation
- **Contextual SSH key setup** prompts for authentication errors
- **HTTPS to SSH URL conversion** suggestions
- **Automatic re-validation** after SSH key generation

## 🚀 **User Experience Flow**

### **For New Users**
1. **User enters private repository URL** → Validation fails with permission error
2. **System suggests SSH key setup** → User clicks "Setup SSH Key" button
3. **SSH Key Manager opens** → User generates new key with one click
4. **Instructions displayed** → User copies public key to Git provider
5. **Connection tested** → System verifies SSH authentication works
6. **Repository re-validated** → Workflow creation can proceed

### **For Power Users**
1. **Direct SSH URL entry** → System validates SSH connection
2. **Existing key management** → View, copy, or delete existing keys
3. **Multiple repository support** → Different keys for different providers
4. **Bulk key operations** → Manage multiple SSH keys efficiently

## 🔒 **Security Considerations**

### **Key Storage**
- **Server-side storage** in standard `~/.ssh` directory
- **Proper Unix permissions** (600 for private keys)
- **No database storage** of private keys (filesystem only)
- **Secure cleanup** of temporary files during generation

### **Connection Testing**
- **Non-intrusive testing** using `ssh -T` for authentication check
- **No repository cloning** during validation
- **Timeout protection** to prevent hanging connections
- **Host key verification** for known Git providers

### **Best Practices**
- **ED25519 keys recommended** for modern security
- **Unique key names** to prevent conflicts
- **Regular key rotation** supported through management interface
- **Provider-specific guidance** for key installation

## 📋 **Supported Git Providers**

### **GitHub**
- ✅ **SSH key format**: Full ED25519 and RSA support
- ✅ **Authentication testing**: `ssh -T git@github.com`
- ✅ **Setup instructions**: Direct links to GitHub SSH settings

### **GitLab**
- ✅ **SSH key format**: Compatible with all key types
- ✅ **Authentication testing**: Standard SSH verification
- ✅ **Setup instructions**: GitLab-specific setup guide

### **Bitbucket**
- ✅ **SSH key format**: Standard SSH key support
- ✅ **Authentication testing**: SSH connection verification
- ✅ **Setup instructions**: Bitbucket SSH key setup

### **Generic Git Providers**
- ✅ **Standard SSH**: Works with any Git provider
- ✅ **Custom hostnames**: Automatic hostname detection
- ✅ **Flexible URLs**: Support for various SSH URL formats

## 🛠️ **Technical Implementation Details**

### **Key Generation Process**
```bash
# ED25519 key generation (recommended)
ssh-keygen -t ed25519 -f ~/.ssh/key_name -N '' -q -C "email@example.com"

# RSA key generation (compatibility)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/key_name -N '' -q -C "email@example.com"
```

### **Connection Testing**
```bash
# GitHub SSH test
ssh -T git@github.com -o StrictHostKeyChecking=no -o ConnectTimeout=10

# Generic Git provider test
ssh -T git@hostname -o StrictHostKeyChecking=no -o ConnectTimeout=10
```

### **File Permissions**
```bash
# SSH directory
chmod 700 ~/.ssh

# Private key
chmod 600 ~/.ssh/key_name

# Public key  
chmod 644 ~/.ssh/key_name.pub
```

## 🎯 **Benefits for Users**

### **For Developers**
- ✅ **No manual SSH setup** required
- ✅ **Visual guidance** through the entire process
- ✅ **Immediate validation** of SSH key functionality
- ✅ **Multiple key management** for different projects

### **For Teams**
- ✅ **Consistent SSH setup** across team members
- ✅ **Reduced support burden** for Git authentication issues
- ✅ **Standardized key formats** and security practices
- ✅ **Self-service key management** without IT involvement

### **For Security**
- ✅ **Modern key algorithms** (ED25519 by default)
- ✅ **Proper key storage** with secure file permissions
- ✅ **No hardcoded credentials** in configurations
- ✅ **Key rotation support** through management interface

## 🔄 **Integration Points**

### **Workflow Creation**
- **Real-time Git validation** with SSH support
- **Contextual SSH key prompts** for authentication errors
- **Automatic re-validation** after key generation
- **Smart URL format suggestions** (HTTPS ↔ SSH)

### **Repository Management**
- **Multi-protocol support** (HTTPS and SSH)
- **Provider-agnostic** key management
- **Connection verification** before workflow creation
- **Error recovery workflows** for authentication failures

## 🚀 **Future Enhancements**

### **Planned Features**
- **Key expiration management** with renewal reminders
- **Multiple keys per provider** for different access levels
- **SSH agent integration** for password-less operations
- **Key backup and recovery** mechanisms

### **Advanced Security**
- **Hardware security module** integration
- **Key rotation policies** with automated enforcement
- **Audit logging** for key operations
- **Multi-factor authentication** for key generation

---

This SSH key management system transforms Git repository access from a complex manual process into a guided, secure, and user-friendly experience! 🚀