# User Authentication - Quick Start Guide

Get up and running with the new authentication system in 5 minutes!

## 🚀 Quick Setup (5 Steps)

### Step 1: Set JWT Secret Key

Add to your environment or `.env` file:

```bash
# Generate a secure secret key
openssl rand -hex 32

# Add to your .env file or docker-compose.yml
JWT_SECRET_KEY=your-generated-secret-key-here
```

### Step 2: Start Backend

```bash
cd claude-workflow-manager/backend
python main.py
```

You should see:
```
🚀 APPLICATION: Starting up...
✅ APPLICATION: Database connected successfully
✅ DATABASE: Indexes created successfully
```

### Step 3: Start Frontend

```bash
cd claude-workflow-manager/frontend
npm install  # Only needed first time
npm start
```

Your browser will open to `http://localhost:3000`

### Step 4: Create Your Account

1. Navigate to `http://localhost:3000/register`
2. Fill in the registration form:
   - Username: `testuser` (3-50 characters)
   - Email: `test@example.com`
   - Password: `password123` (minimum 8 characters)
   - Full Name: `Test User` (optional)
3. Click "Create Account"
4. You'll be automatically logged in and redirected to the home page

### Step 5: Explore!

You're now logged in! Notice:
- Your username appears in the top right
- Click your avatar to see the user menu
- Try navigating to different pages
- Visit `/profile` to see your account info
- Click "Logout" when done

## 🧪 Test the API Directly

### Using cURL

**Register:**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "apiuser",
    "email": "api@example.com",
    "password": "securepass123"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username_or_email": "apiuser",
    "password": "securepass123"
  }'
```

**Get Current User:**
```bash
# Save token from login response
TOKEN="your-token-here"

curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Using Swagger UI

1. Navigate to `http://localhost:8000/api/docs`
2. Find the "Authentication" section
3. Try the endpoints interactively
4. Click "Authorize" button to set your token

### Using Test Script

```bash
cd claude-workflow-manager/backend
python test_scripts/test_auth.py
```

This will automatically test all authentication endpoints.

## 📱 Frontend Pages

### Login Page - `/login`
- Username or email
- Password
- "Sign up" link if you don't have an account

### Register Page - `/register`
- Username (3-50 chars, unique)
- Email (valid format, unique)
- Full name (optional)
- Password (min 8 chars)
- Confirm password
- "Sign in" link if you already have an account

### Profile Page - `/profile`
- User avatar
- Account information
- Status badges (Active, Admin)
- Account dates

### User Menu (Top Right)
- Shows your username
- Click avatar for menu:
  - View email
  - Go to Profile
  - Logout

## 🎯 Common Tasks

### Task 1: Login with Existing Account
1. Go to `http://localhost:3000/login`
2. Enter username/email and password
3. Click "Sign In"
4. You'll be redirected to the home page

### Task 2: View Your Profile
1. Click your avatar (top right)
2. Click "Profile"
3. See your account information

### Task 3: Logout
1. Click your avatar (top right)
2. Click "Logout"
3. You'll be redirected to the login page

### Task 4: Stay Logged In
- Your session is saved in localStorage
- Close your browser and come back
- You'll still be logged in
- Session lasts 7 days (configurable)

### Task 5: Use API from Code
```typescript
import { authApi } from './services/api';

// Login
const response = await authApi.login('username', 'password');
console.log('Token:', response.access_token);
console.log('User:', response.user);

// Get current user
const user = await authApi.getCurrentUser();
console.log('Current user:', user);

// Logout
await authApi.logout();
```

## 🔍 Verify Everything Works

### Backend Verification
- [ ] Backend starts without errors
- [ ] MongoDB connection successful
- [ ] Can access Swagger UI at `/api/docs`
- [ ] Authentication endpoints show in Swagger

### Frontend Verification
- [ ] Frontend loads at `http://localhost:3000`
- [ ] Can navigate to `/login`
- [ ] Can navigate to `/register`
- [ ] No console errors

### Full Flow Test
1. [ ] Register new user → Success
2. [ ] Logout → Redirected to login
3. [ ] Login → Redirected to home
4. [ ] User menu shows username
5. [ ] Can view profile page
6. [ ] Refresh page → Still logged in
7. [ ] Logout → Redirected to login

## 🚨 Troubleshooting

### Backend Won't Start
```bash
# Check if MongoDB is running
# Check environment variables
# Check port 8000 is available
netstat -an | grep 8000
```

### Frontend Won't Start
```bash
# Make sure dependencies are installed
npm install

# Check if port 3000 is available
netstat -an | grep 3000

# Clear npm cache if needed
npm cache clean --force
```

### Can't Login
- Check backend is running
- Check MongoDB is connected
- Check browser console for errors
- Check Network tab for failed requests
- Try registering a new account

### Token Expired
- Tokens last 7 days by default
- Just login again to get a new token
- Consider implementing refresh tokens

### Lost Access
- Create a new account
- Or check MongoDB directly to reset password:
  ```javascript
  // In MongoDB shell
  db.users.findOne({username: "youruser"})
  ```

## 📖 Next Steps

Now that authentication is working:

1. **Protect Specific Routes**
   - Add auth checks to sensitive endpoints
   - Implement role-based access control

2. **Customize User Experience**
   - Add user preferences
   - Implement user settings page
   - Add profile editing

3. **Enhance Security**
   - Add email verification
   - Implement password reset
   - Add 2FA (two-factor auth)

4. **Monitor Usage**
   - Track login attempts
   - Monitor active sessions
   - Log authentication events

5. **Deploy to Production**
   - Use environment variables
   - Set up HTTPS
   - Configure secure cookies
   - Add rate limiting

## 📚 More Information

- **Complete Backend Docs**: `USER_AUTHENTICATION.md`
- **Complete Frontend Docs**: `FRONTEND_AUTH_IMPLEMENTATION.md`
- **Full System Overview**: `FULL_STACK_AUTH_SUMMARY.md`
- **API Documentation**: `http://localhost:8000/api/docs`

## 💡 Tips

1. **Use Strong Passwords**: Minimum 8 characters, but longer is better
2. **Unique Usernames**: Usernames must be unique across all users
3. **Valid Emails**: Email format is validated
4. **Token Storage**: Tokens are stored in localStorage
5. **Session Length**: Tokens expire after 7 days (configurable)
6. **Auto-Logout**: Invalid tokens trigger automatic logout
7. **Error Messages**: Watch for helpful error messages in the UI

## ✅ You're All Set!

Your authentication system is ready to use! 🎉

**Questions?** Check the documentation or open an issue.

**Working perfectly?** Start building your authenticated features!

