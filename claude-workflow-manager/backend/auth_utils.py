from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import os

# Password hashing with explicit bcrypt configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Explicit rounds configuration
)

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production-please-use-openssl-rand")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password"""
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    """Hash a plain password with bcrypt (max 72 bytes)"""
    try:
        # Ensure password is a string
        if not isinstance(password, str):
            raise ValueError(f"Password must be a string, got {type(password)}")
        
        # Bcrypt only uses the first 72 bytes of the password
        # Truncate if necessary to avoid errors
        password_bytes = password.encode('utf-8')
        print(f"🔐 Hashing password: {len(password)} chars, {len(password_bytes)} bytes")
        
        if len(password_bytes) > 72:
            # Truncate to 72 bytes and decode back to string
            password = password_bytes[:72].decode('utf-8', errors='ignore')
            print(f"⚠️  Truncated password to 72 bytes")
        
        # Hash the password
        hashed = pwd_context.hash(password)
        print(f"✅ Password hashed successfully")
        return hashed
        
    except Exception as e:
        print(f"❌ Password hashing failed with error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT access token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

