# Password Hashing Debug Guide

## Issue
Getting "Password hashing failed" error even with simple passwords like "kNcb7jS8" (8 ASCII chars = 8 bytes).

## ROOT CAUSE FOUND ✅

**Version Incompatibility:** `bcrypt==4.0.1` removed the `__about__` attribute, which `passlib==1.7.4` relies on to detect the bcrypt version. This causes passlib to fail loading the bcrypt backend properly, resulting in spurious errors.

**Solution:** Downgrade bcrypt to `3.2.2`, which is compatible with passlib 1.7.4.

**Error signature:**
```
(trapped) error reading bcrypt version
AttributeError: module 'bcrypt' has no attribute '__about__'
```

## Changes Made

### 1. Enhanced Logging in `auth_utils.py`
Added detailed logging to track:
- Password length (characters and bytes)
- Truncation if needed
- Success/failure with full traceback

### 2. Explicit Bcrypt Configuration
```python
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Explicit rounds
)
```

### 3. Fixed bcrypt Version Incompatibility
Updated `requirements.txt` to use `bcrypt==3.2.2` (compatible with passlib 1.7.4) instead of `bcrypt==4.0.1`.

## How to Debug

### Step 1: Check Backend Logs
After deployment, look for these log lines:

```
🔍 Registration attempt:
   Username: alexchang@alumni.ucla.edu
   Email: alexchang@alumni.ucla.edu
   Password length: 8 chars
   Password bytes: 8

🔐 Hashing password: 8 chars, 8 bytes
✅ Password hashed successfully
```

Or if it fails:
```
❌ Password hashing failed with error: [ErrorType]: [error message]
[Full traceback]
```

### Step 2: Verify bcrypt Installation
SSH into your server and check:

```bash
# Enter the backend container
docker exec -it claude-workflow-backend bash

# Check if bcrypt is installed
python -c "import bcrypt; print(bcrypt.__version__)"

# Check if passlib works
python -c "from passlib.context import CryptContext; pwd_context = CryptContext(schemes=['bcrypt']); print(pwd_context.hash('test123'))"
```

### Step 3: Check for Common Issues

#### Issue A: bcrypt Not Installed
**Symptom:** `ModuleNotFoundError: No module named 'bcrypt'`

**Solution:**
```bash
# In the container
pip install bcrypt==4.0.1
```

#### Issue B: Version Incompatibility
**Symptom:** Various bcrypt errors

**Solution:**
```bash
# Rebuild the container with updated requirements
docker-compose build --no-cache backend
docker-compose up -d
```

#### Issue C: Character Encoding
**Symptom:** Encoding errors in logs

**Solution:** Already handled by truncation code, but ensure UTF-8 encoding is working.

## Test Locally

You can test password hashing locally:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

# Test with your password
password = "kNcb7jS8"
try:
    hashed = pwd_context.hash(password)
    print(f"✅ Success! Hash: {hashed}")
except Exception as e:
    print(f"❌ Error: {e}")
```

## Expected Behavior

For password "kNcb7jS8":
- ✅ 8 characters
- ✅ 8 bytes (all ASCII)
- ✅ Should hash successfully
- ✅ Should return bcrypt hash like: `$2b$12$...`

## Quick Fix

If the issue persists after deployment, try:

```bash
# SSH into server
ssh your-server

# Stop services
cd ~/claude-workflow-manager-deploy/claude-workflow-manager
docker-compose down

# Rebuild without cache
docker-compose build --no-cache

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

## Manual Test

Once deployed, test the registration endpoint directly:

```bash
curl -X POST http://pop-os-1:8005/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "test1234",
    "full_name": "Test User"
  }'
```

Check the backend logs immediately after:
```bash
docker-compose logs backend | tail -50
```

## What to Look For in Logs

### Success Pattern:
```
🔍 Registration attempt:
   Username: testuser
   Email: test@example.com
   Password length: 8 chars
   Password bytes: 8
🔐 Hashing password: 8 chars, 8 bytes
✅ Password hashed successfully
✅ DATABASE: User created successfully
```

### Failure Pattern:
```
🔍 Registration attempt:
   Username: testuser
   Email: test@example.com
   Password length: 8 chars
   Password bytes: 8
🔐 Hashing password: 8 chars, 8 bytes
❌ Password hashing failed with error: [ERROR_TYPE]: [MESSAGE]
Traceback (most recent call last):
  ...
```

## Report Back

When reporting the issue, include:
1. Backend log output (with the emoji markers)
2. bcrypt version from the container
3. passlib version from the container
4. Any error tracebacks

## Next Steps

After deployment with these changes:
1. Try registration again
2. Check backend logs immediately
3. Share the log output
4. We'll identify the root cause from the detailed logs

