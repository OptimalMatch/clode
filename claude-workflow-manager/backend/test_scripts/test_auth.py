#!/usr/bin/env python3
"""
Test script for user authentication endpoints.

Usage:
    python test_auth.py
"""

import requests
import json
import sys
from datetime import datetime

# API base URL
BASE_URL = "http://localhost:8000"

def print_response(title, response):
    """Pretty print API response"""
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")
    print(f"{'='*60}\n")

def test_register():
    """Test user registration"""
    print("Testing user registration...")
    
    # Generate unique username/email for testing
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    username = f"testuser_{timestamp}"
    email = f"test_{timestamp}@example.com"
    
    data = {
        "username": username,
        "email": email,
        "password": "testpassword123",
        "full_name": "Test User"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json=data)
    print_response("REGISTER USER", response)
    
    if response.status_code == 201:
        result = response.json()
        return result.get("access_token"), username
    else:
        print("❌ Registration failed!")
        return None, None

def test_login(username):
    """Test user login"""
    print(f"Testing login with username: {username}")
    
    data = {
        "username_or_email": username,
        "password": "testpassword123"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/login", json=data)
    print_response("LOGIN USER", response)
    
    if response.status_code == 200:
        result = response.json()
        return result.get("access_token")
    else:
        print("❌ Login failed!")
        return None

def test_get_current_user(token):
    """Test getting current user info"""
    print("Testing get current user...")
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    print_response("GET CURRENT USER", response)
    
    return response.status_code == 200

def test_logout(token):
    """Test user logout"""
    print("Testing logout...")
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
    print_response("LOGOUT USER", response)
    
    return response.status_code == 200

def test_invalid_token():
    """Test with invalid token"""
    print("Testing with invalid token...")
    
    headers = {
        "Authorization": "Bearer invalid_token_12345"
    }
    
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    print_response("GET USER WITH INVALID TOKEN", response)
    
    return response.status_code == 401

def test_duplicate_username(username):
    """Test registration with duplicate username"""
    print(f"Testing duplicate username: {username}")
    
    data = {
        "username": username,
        "email": f"different_{datetime.now().timestamp()}@example.com",
        "password": "testpassword123"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json=data)
    print_response("REGISTER WITH DUPLICATE USERNAME", response)
    
    return response.status_code == 400

def test_weak_password():
    """Test registration with weak password"""
    print("Testing weak password...")
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    data = {
        "username": f"weakpass_{timestamp}",
        "email": f"weak_{timestamp}@example.com",
        "password": "123"  # Too short
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json=data)
    print_response("REGISTER WITH WEAK PASSWORD", response)
    
    return response.status_code == 400

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("USER AUTHENTICATION ENDPOINT TESTS")
    print("="*60)
    
    try:
        # Test 1: Register a new user
        token, username = test_register()
        if not token or not username:
            print("❌ Registration test failed. Stopping tests.")
            sys.exit(1)
        
        # Test 2: Login with the registered user
        login_token = test_login(username)
        if not login_token:
            print("❌ Login test failed. Continuing with other tests...")
        
        # Test 3: Get current user info
        success = test_get_current_user(token)
        if not success:
            print("❌ Get current user test failed.")
        
        # Test 4: Logout
        success = test_logout(token)
        if not success:
            print("❌ Logout test failed.")
        
        # Test 5: Invalid token
        success = test_invalid_token()
        if not success:
            print("❌ Invalid token test failed (should return 401).")
        
        # Test 6: Duplicate username
        success = test_duplicate_username(username)
        if not success:
            print("❌ Duplicate username test failed (should return 400).")
        
        # Test 7: Weak password
        success = test_weak_password()
        if not success:
            print("❌ Weak password test failed (should return 400).")
        
        print("\n" + "="*60)
        print("✅ ALL TESTS COMPLETED")
        print("="*60)
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to the API server.")
        print("Make sure the backend is running at http://localhost:8000")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

