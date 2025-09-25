#!/usr/bin/env python3
"""
Test script for Claude CLI authentication and max plan mode
"""

import subprocess
import os
import sys
import time
import json
import uuid

def run_command(cmd, input_text=None, timeout=30):
    """Run a command and return stdout, stderr, and return code"""
    print(f"🚀 Running command: {' '.join(cmd)}")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE if input_text else None,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        stdout, stderr = process.communicate(input=input_text, timeout=timeout)
        return_code = process.returncode
        
        print(f"✅ Command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        return stdout, stderr, return_code
        
    except subprocess.TimeoutExpired:
        process.kill()
        print(f"⏰ Command timed out after {timeout}s")
        return "", "Command timed out", 1
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return "", str(e), 1

def test_claude_version():
    """Test if Claude CLI is available"""
    print("\n" + "="*50)
    print("🔍 Testing Claude CLI availability")
    print("="*50)
    
    stdout, stderr, code = run_command(["claude", "--version"])
    
    if code == 0:
        print("✅ Claude CLI is available")
        return True
    else:
        print("❌ Claude CLI not found or not working")
        return False

def test_claude_status():
    """Check current Claude CLI status"""
    print("\n" + "="*50)
    print("📊 Checking Claude CLI status")
    print("="*50)
    
    stdout, stderr, code = run_command(["claude", "status"])
    return code == 0

def test_api_key_mode():
    """Test Claude with API key (streaming JSON mode)"""
    print("\n" + "="*50)
    print("🔑 Testing API Key Mode (streaming JSON)")
    print("="*50)
    
    # Test with API key environment
    env = os.environ.copy()
    
    session_id = str(uuid.uuid4())
    cmd = [
        "claude", 
        "--print",
        "--verbose",
        "--output-format", "stream-json",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Bash(*) Edit(*) Write(*) Read(*) MultiEdit(*) TodoWrite(*) Grep(*) LS(*) Glob(*) Python(*)",
        "--session-id", session_id,
        "hello"
    ]
    
    print(f"🆔 Session ID: {session_id}")
    stdout, stderr, code = run_command(cmd)
    
    return code == 0

def test_max_plan_mode():
    """Test Claude with max plan mode (text-only)"""
    print("\n" + "="*50)
    print("🎯 Testing Max Plan Mode (text-only)")
    print("="*50)
    
    # Unset API key environment variables
    env = os.environ.copy()
    if "ANTHROPIC_API_KEY" in env:
        del env["ANTHROPIC_API_KEY"]
    if "CLAUDE_API_KEY" in env:
        del env["CLAUDE_API_KEY"]
    
    session_id = str(uuid.uuid4())
    cmd = [
        "claude", 
        "-p",  # text-only mode
        "--session-id", session_id,
        "hello"
    ]
    
    print(f"🆔 Session ID: {session_id}")
    print("🔧 Environment: API keys unset")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        stdout, stderr = process.communicate(timeout=30)
        return_code = process.returncode
        
        print(f"✅ Command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        return return_code == 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_login_command():
    """Test the /login command"""
    print("\n" + "="*50)
    print("🔐 Testing /login command")
    print("="*50)
    
    # Unset API key environment variables
    env = os.environ.copy()
    if "ANTHROPIC_API_KEY" in env:
        del env["ANTHROPIC_API_KEY"]
    if "CLAUDE_API_KEY" in env:
        del env["CLAUDE_API_KEY"]
    
    session_id = str(uuid.uuid4())
    cmd = [
        "claude", 
        "--print",
        "--verbose", 
        "--output-format", "stream-json",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Bash(*) Edit(*) Write(*) Read(*) MultiEdit(*) TodoWrite(*) Grep(*) LS(*) Glob(*) Python(*)",
        "--session-id", session_id,
        "/login"
    ]
    
    print(f"🆔 Session ID: {session_id}")
    print("🔧 Environment: API keys unset")
    print("💡 This should prompt for max plan authentication")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        stdout, stderr = process.communicate(timeout=60)  # Longer timeout for login
        return_code = process.returncode
        
        print(f"✅ Login command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        return return_code == 0, stdout, stderr
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, "", str(e)

def test_after_login():
    """Test a simple command after /login to see if auth persists"""
    print("\n" + "="*50)
    print("🔄 Testing command after /login")
    print("="*50)
    
    # Try a simple hello command after login
    env = os.environ.copy()
    if "ANTHROPIC_API_KEY" in env:
        del env["ANTHROPIC_API_KEY"]
    if "CLAUDE_API_KEY" in env:
        del env["CLAUDE_API_KEY"]
    
    session_id = str(uuid.uuid4())
    cmd = [
        "claude", 
        "-p",  # text-only mode
        "--session-id", session_id,
        "write a python script that prints 'hello, world!'"
    ]
    
    print(f"🆔 Session ID: {session_id}")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        stdout, stderr = process.communicate(timeout=30)
        return_code = process.returncode
        
        print(f"✅ Command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        return return_code == 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_write_capabilities():
    """Test actual file writing capabilities with proper permissions"""
    print("\n" + "="*50)
    print("✍️ Testing Write Capabilities")
    print("="*50)
    
    # Create a persistent test directory for inspection
    test_dir = os.path.join(os.getcwd(), "claude_write_test")
    if not os.path.exists(test_dir):
        os.makedirs(test_dir)
    print(f"📁 Test directory: {test_dir}")
    
    # Change to the test directory
    original_cwd = os.getcwd()
    os.chdir(test_dir)
    
    try:
        # Unset API key environment variables
        env = os.environ.copy()
        if "ANTHROPIC_API_KEY" in env:
            del env["ANTHROPIC_API_KEY"]
        if "CLAUDE_API_KEY" in env:
            del env["CLAUDE_API_KEY"]
        
        session_id = str(uuid.uuid4())
        
        # Use streaming JSON mode for better control and permission handling
        cmd = [
            "claude", 
            "--print",
            "--verbose",
            "--output-format", "stream-json",
            "--permission-mode", "acceptEdits",
            "--allowedTools", "Bash(*) Edit(*) Write(*) Read(*) MultiEdit(*) TodoWrite(*) Grep(*) LS(*) Glob(*) Python(*)",
            "--session-id", session_id,
            "Please use the Bash tool to create a Python file called 'hello.py' that prints 'Hello, World!' and then run it to verify it works. Execute these exact commands: echo \"print('Hello, World!')\" > hello.py && python3 hello.py"
        ]
        
        print(f"🆔 Session ID: {session_id}")
        print(f"📁 Working directory: {test_dir}")
        print("🔧 Using JSON stream mode with write permissions")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env,
            cwd=test_dir
        )
        
        stdout, stderr = process.communicate(timeout=45)
        return_code = process.returncode
        
        print(f"✅ Command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        # Check if the file was actually created
        hello_file = os.path.join(test_dir, "hello.py")
        file_created = os.path.exists(hello_file)
        
        if file_created:
            print(f"✅ File created successfully: {hello_file}")
            with open(hello_file, 'r') as f:
                content = f.read()
                print(f"📄 File contents:\n{content}")
        else:
            print(f"❌ File not found: {hello_file}")
            print(f"📂 Directory contents: {os.listdir(test_dir)}")
        
        return return_code == 0 and file_created
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        # Return to original directory but keep test directory for inspection
        os.chdir(original_cwd)
        print(f"📁 Test directory preserved for inspection: {test_dir}")
        print(f"💡 You can examine the results with: cd {test_dir} && ls -la")

def test_bash_write_capabilities():
    """Test bash-based file writing capabilities with interactive permission granting"""
    print("\n" + "="*50)
    print("💻 Testing Bash Write Capabilities with Permission Flow")
    print("="*50)
    
    # Create a persistent test directory for inspection
    test_dir = os.path.join(os.getcwd(), "claude_bash_test")
    if not os.path.exists(test_dir):
        os.makedirs(test_dir)
    print(f"📁 Test directory: {test_dir}")
    
    # Change to the test directory
    original_cwd = os.getcwd()
    os.chdir(test_dir)
    
    try:
        # Unset API key environment variables
        env = os.environ.copy()
        if "ANTHROPIC_API_KEY" in env:
            del env["ANTHROPIC_API_KEY"]
        if "CLAUDE_API_KEY" in env:
            del env["CLAUDE_API_KEY"]
        
        session_id = str(uuid.uuid4())
        
        print(f"🆔 Session ID: {session_id}")
        print(f"📁 Working directory: {test_dir}")
        print("💻 Testing with interactive permission flow")
        
        # Step 1: Send initial command
        cmd1 = [
            "claude", 
            "--print",
            "--verbose",
            "--output-format", "stream-json",
            "--permission-mode", "acceptEdits",
            "--allowedTools", "Bash(*) Edit(*) Write(*) Read(*) MultiEdit(*) TodoWrite(*) Grep(*) LS(*) Glob(*) Python(*)",
            "--session-id", session_id,
            "Please create a simple Python file called 'simple.py' that prints 'Hello from bash!' using bash commands. Use echo to write the content to the file."
        ]
        
        print("📤 Sending initial command...")
        process1 = subprocess.Popen(
            cmd1,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env,
            cwd=test_dir
        )
        
        stdout1, stderr1 = process1.communicate(timeout=30)
        print(f"✅ Initial command completed with exit code: {process1.returncode}")
        if stdout1:
            print(f"📤 STDOUT:\n{stdout1[:500]}..." if len(stdout1) > 500 else f"📤 STDOUT:\n{stdout1}")
        
        # Step 2: Grant permission if requested
        if "permission" in stdout1.lower():
            print("🔑 Permission requested - granting Bash tool access...")
            cmd2 = [
                "claude", 
                "--print",
                "--verbose",
                "--output-format", "stream-json",
                "--permission-mode", "acceptEdits",
                "--allowedTools", "Bash(*) Edit(*) Write(*) Read(*) MultiEdit(*) TodoWrite(*) Grep(*) LS(*) Glob(*) Python(*)",
                "--resume", session_id,
                "Yes, I grant permission to use the Bash tool. Please execute: echo 'print(\"Hello from bash!\")' > simple.py"
            ]
            
            process2 = subprocess.Popen(
                cmd2,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
                env=env,
                cwd=test_dir
            )
            
            stdout2, stderr2 = process2.communicate(timeout=30)
            print(f"✅ Permission grant completed with exit code: {process2.returncode}")
            if stdout2:
                print(f"📤 STDOUT:\n{stdout2[:500]}..." if len(stdout2) > 500 else f"📤 STDOUT:\n{stdout2}")
        
        # Check if the file was actually created
        simple_file = os.path.join(test_dir, "simple.py")
        file_created = os.path.exists(simple_file)
        
        if file_created:
            print(f"✅ File created successfully: {simple_file}")
            with open(simple_file, 'r') as f:
                content = f.read()
                print(f"📄 File contents:\n{content}")
        else:
            print(f"❌ File not found: {simple_file}")
            print(f"📂 Directory contents: {os.listdir(test_dir)}")
        
        return file_created
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        # Return to original directory but keep test directory for inspection
        os.chdir(original_cwd)
        print(f"📁 Test directory preserved for inspection: {test_dir}")
        print(f"💡 You can examine the results with: cd {test_dir} && ls -la")

def test_max_plan_write_mode():
    """Test file writing in max plan text-only mode"""
    print("\n" + "="*50)
    print("📝 Testing Max Plan Write Mode")
    print("="*50)
    
    # Create a persistent test directory for inspection
    test_dir = os.path.join(os.getcwd(), "claude_maxplan_test")
    if not os.path.exists(test_dir):
        os.makedirs(test_dir)
    print(f"📁 Test directory: {test_dir}")
    
    # Change to the test directory
    original_cwd = os.getcwd()
    os.chdir(test_dir)
    
    try:
        # Unset API key environment variables
        env = os.environ.copy()
        if "ANTHROPIC_API_KEY" in env:
            del env["ANTHROPIC_API_KEY"]
        if "CLAUDE_API_KEY" in env:
            del env["CLAUDE_API_KEY"]
        
        session_id = str(uuid.uuid4())
        
        # Use text-only mode for max plan
        cmd = [
            "claude", 
            "-p",  # text-only mode
            "--session-id", session_id,
            "Please use bash commands to create a simple Python file called 'test.py' that prints 'Max plan mode works!' and save it to disk. Execute: echo \"print('Max plan mode works!')\" > test.py && python3 test.py"
        ]
        
        print(f"🆔 Session ID: {session_id}")
        print(f"📁 Working directory: {test_dir}")
        print("🎯 Using max plan text-only mode")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env,
            cwd=test_dir
        )
        
        stdout, stderr = process.communicate(timeout=45)
        return_code = process.returncode
        
        print(f"✅ Command completed with exit code: {return_code}")
        if stdout:
            print(f"📤 STDOUT:\n{stdout}")
        if stderr:
            print(f"⚠️ STDERR:\n{stderr}")
        
        # Check if any files were created
        files_created = os.listdir(test_dir)
        print(f"📂 Files created: {files_created}")
        
        # Look for the expected file
        test_file = os.path.join(test_dir, "test.py")
        file_created = os.path.exists(test_file)
        
        if file_created:
            print(f"✅ File created successfully: {test_file}")
            with open(test_file, 'r') as f:
                content = f.read()
                print(f"📄 File contents:\n{content}")
        elif files_created:
            print(f"📄 Other files found, checking contents:")
            for filename in files_created:
                if filename.endswith('.py'):
                    filepath = os.path.join(test_dir, filename)
                    with open(filepath, 'r') as f:
                        content = f.read()
                        print(f"📄 {filename}:\n{content}")
                    file_created = True
        else:
            print(f"❌ No files created in: {test_dir}")
        
        return return_code == 0 and (file_created or len(files_created) > 0)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        # Return to original directory but keep test directory for inspection
        os.chdir(original_cwd)
        print(f"📁 Test directory preserved for inspection: {test_dir}")
        print(f"💡 You can examine the results with: cd {test_dir} && ls -la")

def main():
    """Main test function"""
    print("🧪 Claude CLI Authentication Test Script")
    print("=" * 60)
    
    # Check if Claude CLI is available
    if not test_claude_version():
        print("❌ Cannot proceed without Claude CLI")
        sys.exit(1)
    
    # Test current status
    print("\n📊 Current Claude CLI status:")
    test_claude_status()
    
    # Test scenarios
    results = {
        "api_key_mode": False,
        "max_plan_mode": False,
        "login_command": False,
        "after_login": False,
        "bash_write": False,
        "write_capabilities": False,
        "max_plan_write": False
    }
    
    # Test API key mode
    print("\n🔑 Testing API Key Mode...")
    results["api_key_mode"] = test_api_key_mode()
    
    # Test max plan mode
    print("\n🎯 Testing Max Plan Mode...")
    results["max_plan_mode"] = test_max_plan_mode()
    
    # Test /login command
    print("\n🔐 Testing /login command...")
    login_success, login_stdout, login_stderr = test_login_command()
    results["login_command"] = login_success
    
    # If login was successful, test a follow-up command
    if login_success:
        print("\n🔄 Testing command after successful login...")
        results["after_login"] = test_after_login()
        
        # Test bash write capabilities first (most common)
        print("\n💻 Testing bash write capabilities...")
        results["bash_write"] = test_bash_write_capabilities()
        
        # Test write capabilities with proper permissions
        print("\n✍️ Testing write capabilities...")
        results["write_capabilities"] = test_write_capabilities()
        
        # Test max plan write mode
        print("\n📝 Testing max plan write mode...")
        results["max_plan_write"] = test_max_plan_write_mode()
    
    # Summary
    print("\n" + "="*60)
    print("📊 TEST RESULTS SUMMARY")
    print("="*60)
    
    for test_name, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    # Recommendations
    print("\n💡 RECOMMENDATIONS:")
    if not results["max_plan_mode"] and not results["api_key_mode"]:
        print("❌ Neither API key nor max plan mode is working")
        print("   → Check if Claude CLI is properly installed and configured")
    elif results["login_command"]:
        print("✅ /login command works - use this for authentication")
        print("   → The automatic fallback should work correctly")
        
        if results["bash_write"]:
            print("✅ Bash write capabilities working")
            print("   → Direct bash file creation functional")
        elif results["write_capabilities"]:
            print("✅ Write capabilities working with JSON stream mode")
            print("   → File creation and tool usage functional")
        elif results["max_plan_write"]:
            print("✅ Write capabilities working in max plan mode") 
            print("   → File creation functional in text-only mode")
        else:
            print("⚠️ Write capabilities need verification")
            print("   → Check tool permissions and file system access")
            
    elif results["max_plan_mode"]:
        print("✅ Max plan mode works without /login")
        print("   → Authentication might already be set up")
        
        if results["max_plan_write"]:
            print("✅ Max plan write mode functional")
        else:
            print("⚠️ Max plan write capabilities need testing")
    else:
        print("⚠️ Max plan mode needs authentication via /login")
        print("   → The automatic fallback logic is needed")
    
    print(f"\n📊 WRITE CAPABILITY STATUS:")
    if results.get("bash_write"):
        print("✅ Bash Commands: File writing works")
    else:
        print("❌ Bash Commands: File writing failed or not tested")
        
    if results.get("write_capabilities"):
        print("✅ JSON Stream Mode: File writing works")
    else:
        print("❌ JSON Stream Mode: File writing failed or not tested")
        
    if results.get("max_plan_write"):
        print("✅ Max Plan Mode: File writing works") 
    else:
        print("❌ Max Plan Mode: File writing failed or not tested")

if __name__ == "__main__":
    main()
