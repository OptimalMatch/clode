# Frontend Authentication Implementation

This document describes the frontend implementation of the user authentication system for the Claude Workflow Manager.

## Overview

The frontend authentication system provides:
- User login and registration pages
- Authentication state management with React Context
- Automatic token injection in API requests
- User profile display
- Protected route handling
- Persistent login sessions

## Architecture

### Components

1. **AuthContext** (`src/contexts/AuthContext.tsx`)
   - Global authentication state management
   - Login/register/logout functions
   - User data persistence

2. **LoginPage** (`src/components/LoginPage.tsx`)
   - User login form
   - Username/email + password authentication
   - Error handling and validation

3. **RegisterPage** (`src/components/RegisterPage.tsx`)
   - User registration form
   - Client-side validation
   - Password confirmation

4. **ProfilePage** (`src/components/ProfilePage.tsx`)
   - Display user account information
   - Show account details and status

5. **Layout** (`src/components/Layout.tsx`)
   - User menu with avatar
   - Logout functionality
   - Profile navigation

### API Integration

**Service** (`src/services/api.ts`)
- `authApi.register()` - Register new user
- `authApi.login()` - Authenticate user
- `authApi.getCurrentUser()` - Get current user info
- `authApi.logout()` - Logout user

**Axios Interceptors**
- Request interceptor: Automatically adds JWT token to all requests
- Response interceptor: Handles 401 errors and redirects to login

## Features

### ✅ User Registration
- Username (3-50 characters, unique)
- Email (valid format, unique)
- Password (minimum 8 characters)
- Optional full name
- Client-side validation
- Server-side validation feedback

### ✅ User Login
- Login with username OR email
- Password visibility toggle
- "Remember me" via localStorage
- Automatic redirect after login
- Error handling with user feedback

### ✅ Authentication State Management
- React Context for global auth state
- Persistent sessions (localStorage)
- Token auto-refresh on page load
- Automatic cleanup on logout

### ✅ Protected Routes
- All main app routes require authentication
- Automatic redirect to login if not authenticated
- Public login/register pages

### ✅ User Profile
- Display user information
- Show account status (active/admin)
- Account creation and last login dates
- Avatar with username initial

### ✅ Token Management
- JWT tokens stored in localStorage
- Tokens automatically added to API requests
- 401 handling with auto-logout
- Token expiration handling

## File Structure

```
frontend/src/
├── components/
│   ├── LoginPage.tsx          # Login form component
│   ├── RegisterPage.tsx       # Registration form component
│   ├── ProfilePage.tsx        # User profile display
│   └── Layout.tsx             # Updated with user menu
├── contexts/
│   └── AuthContext.tsx        # Authentication context provider
├── services/
│   └── api.ts                 # Updated with auth endpoints
└── App.tsx                    # Updated with routes
```

## Usage Examples

### Using AuthContext in Components

```typescript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please login</div>;
  }

  return (
    <div>
      <p>Welcome, {user?.username}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Making Authenticated API Calls

```typescript
// No need to manually add token - it's automatic!
import { workflowApi } from '../services/api';

async function getWorkflows() {
  const workflows = await workflowApi.getAll();
  return workflows;
}
```

### Protecting Routes

Routes are automatically protected by the layout. If you need to add a new route:

```typescript
// In App.tsx
<Route path="/new-page" element={<Layout><NewPage /></Layout>} />
```

## User Flow

### Registration Flow
1. User navigates to `/register`
2. Fills in registration form
3. Submits form
4. If successful:
   - Token stored in localStorage
   - User data stored in localStorage
   - Redirected to home page (`/`)
5. If error:
   - Error message displayed
   - Form remains for correction

### Login Flow
1. User navigates to `/login`
2. Enters username/email and password
3. Submits form
4. If successful:
   - Token stored in localStorage
   - User data stored in localStorage
   - Redirected to home page (`/`)
5. If error:
   - Error message displayed
   - Form remains for retry

### Session Persistence
1. On app load:
   - AuthContext checks localStorage for token
   - If token exists, validates with backend
   - If valid, user is logged in
   - If invalid, token is cleared
2. During session:
   - All API requests include token
   - Token errors trigger auto-logout
3. On logout:
   - Token cleared from localStorage
   - User redirected to login page

## Security Features

### Client-Side Security
- Passwords never logged or stored
- Tokens stored in localStorage (consider httpOnly cookies for production)
- Automatic token cleanup on logout
- Token expiration handling
- HTTPS recommended for production

### Validation
- Client-side validation before API call
- Server-side validation as final check
- Password strength requirements
- Email format validation
- Username length validation

## Styling

The authentication pages use Material-UI components with the dark theme:
- Consistent with existing app design
- Responsive layout
- Clean, modern UI
- User-friendly form validation
- Loading states for async operations

## State Management

### AuthContext State
```typescript
{
  user: User | null;              // Current user or null if logged out
  isAuthenticated: boolean;       // True if user is logged in
  isLoading: boolean;             // True while checking auth status
  login: (username, password) => Promise<void>;
  register: (username, email, password, fullName?) => Promise<void>;
  logout: () => Promise<void>;
}
```

### LocalStorage Data
```typescript
{
  access_token: string;           // JWT token
  user: string;                   // JSON stringified User object
}
```

## Error Handling

### Login/Register Errors
- Invalid credentials → "Invalid username/email or password"
- Duplicate username → "Username already exists"
- Duplicate email → "Email already exists"
- Weak password → "Password must be at least 8 characters long"
- Network error → "Failed to connect to server"

### API Request Errors
- 401 Unauthorized → Auto-logout and redirect to login
- Other errors → Displayed to user with appropriate message

## Testing

### Manual Testing Checklist
- [ ] Register a new user
- [ ] Login with username
- [ ] Login with email
- [ ] View user profile
- [ ] Logout
- [ ] Try invalid login credentials
- [ ] Try registering duplicate username
- [ ] Try registering duplicate email
- [ ] Check token persistence (refresh page)
- [ ] Check protected routes redirect to login

### Browser Console Testing
```javascript
// Check if user is logged in
localStorage.getItem('access_token')
localStorage.getItem('user')

// Manually clear auth data
localStorage.removeItem('access_token')
localStorage.removeItem('user')
```

## Development

### Running the Frontend
```bash
cd claude-workflow-manager/frontend
npm install
npm start
```

The app will run on `http://localhost:3000`

### Environment Variables
No additional environment variables needed for authentication. The API URL is automatically configured.

## Production Considerations

### Security Enhancements
1. **Use HttpOnly Cookies**: Instead of localStorage for token storage
2. **Implement CSRF Protection**: Add CSRF tokens to forms
3. **Use Secure Flag**: For cookies in production
4. **Add Rate Limiting**: On login/register endpoints
5. **Implement 2FA**: Two-factor authentication
6. **Password Reset**: Add forgot password flow
7. **Email Verification**: Verify email addresses

### Performance Optimizations
1. **Code Splitting**: Lazy load auth pages
2. **Token Refresh**: Implement refresh token flow
3. **Session Management**: Add session timeout warnings
4. **Cache User Data**: Use React Query for user data

### User Experience
1. **Loading States**: Show spinners during auth operations
2. **Error Messages**: User-friendly error messages
3. **Success Feedback**: Show success messages
4. **Redirect Handling**: Save intended destination
5. **Remember Me**: Optional persistent login

## Troubleshooting

### "Invalid authentication token" error
- Token has expired or is invalid
- Clear localStorage and login again
- Check backend JWT_SECRET_KEY is consistent

### User menu not showing after login
- Check AuthContext is properly wrapped around App
- Verify token is stored in localStorage
- Check browser console for errors

### API requests returning 401
- Token might be expired
- Backend might not be running
- Check CORS configuration
- Verify Authorization header is being sent

### Unable to login/register
- Check backend is running on port 8000 (or configured port)
- Verify API URL is correct
- Check browser network tab for errors
- Verify backend database is connected

## Future Enhancements

Potential additions:
- [ ] OAuth integration (Google, GitHub)
- [ ] Two-factor authentication (2FA)
- [ ] Password reset flow
- [ ] Email verification
- [ ] User settings page
- [ ] Profile editing
- [ ] Avatar upload
- [ ] Role-based UI elements
- [ ] Activity log/audit trail
- [ ] Session management page

## API Endpoints Used

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

See `USER_AUTHENTICATION.md` for complete API documentation.

## Support

For issues or questions:
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify backend is running and accessible
4. Check backend logs for error details
5. Review this documentation
6. Open an issue on the project repository

