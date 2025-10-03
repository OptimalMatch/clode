# User Authentication System

This document describes the user authentication system added to the Claude Workflow Manager backend API.

## Overview

The authentication system provides secure user account management with email/username and password authentication using:

- **Password Hashing**: Bcrypt via passlib for secure password storage
- **JWT Tokens**: JSON Web Tokens for stateless authentication
- **MongoDB Storage**: User accounts stored in MongoDB with unique username/email constraints

## Features

- ✅ User registration with username, email, and password
- ✅ User login with username or email
- ✅ JWT token-based authentication
- ✅ Password hashing with bcrypt
- ✅ User profile retrieval
- ✅ Logout endpoint
- ✅ Token expiration (7 days by default)
- ✅ Unique username and email constraints
- ✅ Account activation/deactivation support

## API Endpoints

### 1. Register New User

**POST** `/api/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123",
  "full_name": "John Doe"
}
```

**Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "is_active": true,
    "is_admin": false,
    "created_at": "2025-10-03T10:30:00",
    "last_login": null
  }
}
```

**Validation:**
- Username: 3-50 characters, must be unique
- Email: Valid email format, must be unique
- Password: Minimum 8 characters, maximum 72 **bytes** (bcrypt limitation)

**Error Responses:**
- `400 Bad Request`: Invalid input or username/email already exists
- `500 Internal Server Error`: Server error during registration

---

### 2. User Login

**POST** `/api/auth/login`

Authenticate with username/email and password.

**Request Body:**
```json
{
  "username_or_email": "johndoe",
  "password": "securepassword123"
}
```

You can use either username or email in the `username_or_email` field.

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "is_active": true,
    "is_admin": false,
    "created_at": "2025-10-03T10:30:00",
    "last_login": "2025-10-03T11:45:00"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials or account deactivated
- `500 Internal Server Error`: Server error during login

---

### 3. Get Current User

**GET** `/api/auth/me`

Get the currently authenticated user's information.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_admin": false,
  "created_at": "2025-10-03T10:30:00",
  "last_login": "2025-10-03T11:45:00"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired token
- `500 Internal Server Error`: Server error

---

### 4. User Logout

**POST** `/api/auth/logout`

Logout the current user.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "message": "Logout successful. Please discard your access token.",
  "success": true
}
```

**Note:** Since JWT tokens are stateless, logout is handled client-side by discarding the token. This endpoint is provided for consistency and future server-side cleanup if needed.

---

## Frontend Integration

### Example: Register a New User

```typescript
const registerUser = async (username: string, email: string, password: string) => {
  const response = await fetch('http://localhost:8000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      email,
      password,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  const data = await response.json();
  
  // Store the token in localStorage or a secure cookie
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};
```

### Example: Login

```typescript
const loginUser = async (usernameOrEmail: string, password: string) => {
  const response = await fetch('http://localhost:8000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username_or_email: usernameOrEmail,
      password,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  const data = await response.json();
  
  // Store the token
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};
```

### Example: Authenticated Request

```typescript
const getCurrentUser = async () => {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('http://localhost:8000/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired or invalid, redirect to login
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error('Failed to get user info');
  }

  return await response.json();
};
```

### Example: Logout

```typescript
const logoutUser = async () => {
  const token = localStorage.getItem('access_token');
  
  if (token) {
    try {
      await fetch('http://localhost:8000/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
  }
  
  // Clear local storage regardless of API call result
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  
  // Redirect to login page
  window.location.href = '/login';
};
```

## Security Configuration

### Environment Variables

Set the following environment variable in your `.env` file or deployment configuration:

```bash
# JWT Secret Key - IMPORTANT: Change this in production!
JWT_SECRET_KEY=your-secret-key-here-use-openssl-rand-hex-32

# Token expiration (optional, defaults to 7 days)
JWT_EXPIRATION_MINUTES=10080
```

**To generate a secure secret key:**
```bash
openssl rand -hex 32
```

### Password Requirements

- **Minimum:** 8 characters (enforced by API)
- **Maximum:** 72 **bytes** (bcrypt limitation)
- **Important:** The limit is in bytes, not characters!
  - Regular ASCII characters = 1 byte each (e.g., "abcdefg" = 7 bytes)
  - Special characters/emojis = 2-4 bytes each (e.g., "🔥" = 4 bytes)
  - Example: "hello🔥🔥" = 5 chars but 13 bytes (5 + 4 + 4)
- **Recommended:** Use uppercase, lowercase, numbers, and special characters
- **Note:** Bcrypt hashing algorithm has a 72-byte limit

### Token Security

- JWT tokens expire after 7 days by default
- Tokens should be stored securely (httpOnly cookies recommended for production)
- Never expose tokens in URLs or logs
- Use HTTPS in production to prevent token interception

## Database Schema

### Users Collection

```javascript
{
  _id: ObjectId,
  id: String (UUID),
  username: String (unique),
  email: String (unique, lowercase),
  hashed_password: String (bcrypt hash),
  full_name: String (optional),
  is_active: Boolean,
  is_admin: Boolean,
  created_at: DateTime,
  updated_at: DateTime,
  last_login: DateTime (optional)
}
```

### Indexes

- `username`: Unique index
- `email`: Unique index
- `created_at`: Non-unique index for sorting

## Future Enhancements

Potential additions to the authentication system:

- [ ] Email verification
- [ ] Password reset flow
- [ ] Two-factor authentication (2FA)
- [ ] OAuth integration (Google, GitHub, etc.)
- [ ] Role-based access control (RBAC)
- [ ] Session management and token blacklisting
- [ ] Password strength requirements
- [ ] Rate limiting on login attempts
- [ ] Account lockout after failed attempts

## Testing

### Using cURL

**Register:**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpassword123",
    "full_name": "Test User"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username_or_email": "testuser",
    "password": "testpassword123"
  }'
```

**Get Current User:**
```bash
TOKEN="your-token-here"
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Using the Swagger UI

1. Navigate to `http://localhost:8000/api/docs`
2. Find the "Authentication" section
3. Try the endpoints interactively
4. Use the "Authorize" button to set your token for authenticated requests

## Troubleshooting

### "Username already exists" error
- The username is already taken. Try a different username.

### "Email already exists" error
- The email is already registered. Try logging in or use a different email.

### "Invalid authentication token" error
- Your token has expired or is invalid. Login again to get a new token.

### "User account is deactivated" error
- Your account has been deactivated by an administrator. Contact support.

## Support

For questions or issues related to user authentication, please:
1. Check the API documentation at `/api/docs`
2. Review this documentation
3. Check the backend logs for error details
4. Open an issue on the project repository

