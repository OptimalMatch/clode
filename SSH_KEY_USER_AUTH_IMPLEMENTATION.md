# SSH Key User Authentication Implementation

## Overview
SSH keys are now tied to authenticated users, ensuring that each user can only generate, view, and manage their own SSH keys.

## Backend Changes

### 1. Database Model (`models.py`)
- **Added `SSHKey` model** with user association:
  ```python
  class SSHKey(BaseModel):
      id: Optional[str] = None
      user_id: str  # Owner of this SSH key
      key_name: str
      fingerprint: str
      public_key: str
      private_key_path: str
      created_at: datetime
      last_used: Optional[datetime] = None
  ```

- **Updated `SSHKeyInfo` response model** to include `id`:
  ```python
  class SSHKeyInfo(BaseModel):
      id: str  # Added for frontend deletion
      fingerprint: str
      key_name: str
      public_key: str
      created_at: str
      last_used: Optional[str] = None
  ```

### 2. Database Methods (`database.py`)
Added complete SSH key management methods:
- `create_ssh_key(ssh_key)` - Store SSH key metadata
- `get_ssh_keys_by_user(user_id)` - List user's keys
- `get_ssh_key_by_id(key_id, user_id)` - Get specific key (with ownership check)
- `get_ssh_key_by_name(key_name, user_id)` - Find key by name for user
- `update_ssh_key_last_used(key_id, user_id)` - Track key usage
- `delete_ssh_key(key_id, user_id)` - Delete key (with ownership check)

### 3. File System Organization (`main.py`)
Updated SSH key storage functions to support user isolation:

- **`get_ssh_key_directory(user_id)`**
  - Creates user-specific subdirectories
  - Path structure: `/app/ssh_keys/{user_id}/`
  - Ensures proper permissions (0o700)

- **`save_ssh_key(key_name, private_key, public_key, user_id)`**
  - Saves keys to user-specific directory
  - Sets proper file permissions (0o600 for private, 0o644 for public)

- **`list_ssh_keys_for_user(user_id)`**
  - Queries database for user's keys
  - Verifies key files still exist on disk

### 4. API Endpoints (`main.py`)

#### POST `/api/ssh/generate-key` ✅ **Authentication Required**
- Requires JWT token via `Depends(get_current_user)`
- Associates generated key with authenticated user
- Stores key metadata in database
- Saves key files to user-specific directory
- Returns 401 if not authenticated

**Changes:**
- Added `current_user` dependency
- Checks for existing key names per user
- Uses user's email as default for key generation
- Stores key record in database

#### GET `/api/ssh/keys` ✅ **Authentication Required**
- Requires JWT token via `Depends(get_current_user)`
- Returns only keys owned by the authenticated user
- Returns 401 if not authenticated

**Changes:**
- Added `current_user` dependency
- Calls `list_ssh_keys_for_user(current_user.id)`
- Users can only see their own keys

#### DELETE `/api/ssh/keys/{key_id}` ✅ **NEW - Authentication Required**
- Requires JWT token via `Depends(get_current_user)`
- Deletes key from database and filesystem
- Ownership check ensures users can only delete their own keys
- Returns 404 if key not found or not owned by user

## Frontend Changes

### 1. API Service (`services/api.ts`)
- Updated `deleteKey` to accept `keyId` instead of `keyName`
- Uses key ID for deletion endpoint: `DELETE /api/ssh/keys/${keyId}`

### 2. Types (`types/index.ts`)
- Added `id: string` field to `SSHKeyInfo` interface
- Required for frontend to identify keys for deletion

### 3. SSH Key Management Component (`components/SSHKeyManagement.tsx`)
- Updated delete button to pass `key.id` instead of `key.key_name`
- Delete functionality now uses the unique key ID

### 4. Route Protection (`App.tsx`)
- SSH Keys page wrapped with `ProtectedRoute`
- Redirects unauthenticated users to login page
- Path: `/ssh-keys` now requires authentication

## Security Features

### User Isolation
1. **Database Level**: All queries filter by `user_id`
2. **File System Level**: Keys stored in user-specific directories
3. **API Level**: Endpoints verify user ownership before any operation

### Access Control
- Users can only:
  - Generate keys for themselves
  - View their own keys
  - Delete their own keys
  - Test connections with their own keys

### Authentication
- All SSH key management endpoints require JWT authentication
- Tokens validated via `get_current_user` dependency
- Invalid/missing tokens return 401 Unauthorized

## Migration Notes

### For Existing Keys
If there are existing SSH keys without user association:
1. Keys will remain in the old directory structure
2. New keys will be stored in user-specific directories
3. Consider migration script to:
   - Assign existing keys to users
   - Move files to user-specific directories
   - Update database records

### Database Index Recommendations
Add indexes for performance:
```javascript
// MongoDB
db.ssh_keys.createIndex({ "user_id": 1 })
db.ssh_keys.createIndex({ "user_id": 1, "key_name": 1 }, { unique: true })
```

## Testing

### Backend Tests
Test scenarios:
1. ✅ Generate key with authentication
2. ✅ List keys returns only user's keys
3. ✅ Delete key requires ownership
4. ✅ Cannot delete another user's key
5. ✅ Duplicate key names allowed across users
6. ✅ 401 for unauthenticated requests

### Frontend Tests
Test scenarios:
1. ✅ SSH Keys page redirects if not logged in
2. ✅ After login, redirect back to SSH Keys page
3. ✅ Delete button sends correct key ID
4. ✅ Key list refreshes after deletion
5. ✅ Error handling for failed operations

## Usage Example

### Generate a Key
```typescript
// Frontend automatically includes JWT token
const result = await sshApi.generateKey('my-github-key', 'ed25519', 'user@example.com');
```

### List User's Keys
```typescript
// Only returns keys owned by authenticated user
const keys = await sshApi.listKeys();
```

### Delete a Key
```typescript
// Can only delete own keys
await sshApi.deleteKey(keyId);
```

## Benefits

1. **Security**: Users cannot access or interfere with other users' SSH keys
2. **Privacy**: Each user has their own isolated key storage
3. **Multi-tenancy**: Support multiple users on the same system
4. **Auditability**: Track key ownership and usage per user
5. **Compliance**: Meets security requirements for user data isolation

## File Structure
```
/app/ssh_keys/
├── {user_id_1}/
│   ├── key_name_1
│   ├── key_name_1.pub
│   ├── key_name_2
│   └── key_name_2.pub
├── {user_id_2}/
│   ├── my_key
│   └── my_key.pub
└── ...
```

## Database Schema
```javascript
{
  "_id": ObjectId,
  "id": "uuid-string",
  "user_id": "user-uuid",
  "key_name": "my-github-key",
  "fingerprint": "SHA256:...",
  "public_key": "ssh-ed25519 AAAA...",
  "private_key_path": "/app/ssh_keys/{user_id}/my-github-key",
  "created_at": ISODate("2024-..."),
  "last_used": ISODate("2024-...") // optional
}
```

## Summary

All SSH key operations now require user authentication and enforce ownership:
- ✅ Generate keys → Tied to authenticated user
- ✅ List keys → Shows only user's keys
- ✅ Delete keys → Can only delete own keys
- ✅ File storage → User-specific directories
- ✅ Database records → Include user_id
- ✅ Frontend → Protected routes and proper API calls

