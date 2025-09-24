import os
import json
import yaml
import subprocess
import tempfile
import re
from typing import List, Dict, Optional, Any
from pathlib import Path
from models import Subagent, SubagentCapability
from database import Database

class AgentDiscovery:
    def __init__(self, db: Database):
        self.db = db
        self.agents_folder_path = os.getenv("CLAUDE_AGENTS_FOLDER", ".claude/agents")
        
    async def discover_agents_from_repo(self, git_repo: str, workflow_id: str) -> List[Subagent]:
        """
        Discover and import subagents from a git repository's .claude/agents/ folder
        """
        discovered_agents = []
        
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                print(f"🔍 AGENT DISCOVERY: Starting discovery for repo: {git_repo}")
                print(f"📁 AGENT DISCOVERY: Using temp directory: {temp_dir}")
                
                # Clone the repository with SSH support
                env = os.environ.copy()
                env['GIT_SSH_COMMAND'] = 'ssh -o UserKnownHostsFile=/home/claude/.ssh/known_hosts -o StrictHostKeyChecking=no -i /app/ssh_keys/claude-workflow-manager8'
                
                print(f"🚀 AGENT DISCOVERY: Starting git clone...")
                result = subprocess.run(
                    ["git", "clone", "--depth", "1", git_repo, temp_dir],
                    check=True,
                    capture_output=True,
                    env=env
                )
                print(f"✅ AGENT DISCOVERY: Git clone completed successfully")
                print(f"📊 AGENT DISCOVERY: Clone stdout: {result.stdout.decode()}")
                if result.stderr:
                    print(f"⚠️  AGENT DISCOVERY: Clone stderr: {result.stderr.decode()}")
                
                # List directory contents
                print(f"📋 AGENT DISCOVERY: Repository contents:")
                for root, dirs, files in os.walk(temp_dir):
                    level = root.replace(temp_dir, '').count(os.sep)
                    indent = ' ' * 2 * level
                    print(f"{indent}{os.path.basename(root)}/")
                    sub_indent = ' ' * 2 * (level + 1)
                    for file in files:
                        print(f"{sub_indent}{file}")
                
                # Look for agents folder (configurable via CLAUDE_AGENTS_FOLDER)
                agents_folder = Path(temp_dir) / self.agents_folder_path
                print(f"🔍 AGENT DISCOVERY: Looking for agents folder at: {agents_folder}")
                
                if not agents_folder.exists():
                    print(f"❌ AGENT DISCOVERY: No {self.agents_folder_path}/ folder found")
                    return discovered_agents
                
                print(f"✅ AGENT DISCOVERY: Found {self.agents_folder_path}/ folder")
                agent_files = list(agents_folder.glob("*"))
                print(f"📁 AGENT DISCOVERY: Found {len(agent_files)} files in agents folder:")
                for f in agent_files:
                    print(f"   - {f.name} ({'file' if f.is_file() else 'directory'})")
                
                # Scan for agent definition files
                for agent_file in agents_folder.glob("*"):
                    if agent_file.is_file() and agent_file.suffix in ['.json', '.yaml', '.yml', '.md']:
                        print(f"📄 AGENT DISCOVERY: Processing agent file: {agent_file.name}")
                        try:
                            agent = await self._parse_agent_file(agent_file, workflow_id)
                            if agent:
                                print(f"✅ AGENT DISCOVERY: Successfully parsed agent: {agent.name}")
                                discovered_agents.append(agent)
                            else:
                                print(f"⚠️  AGENT DISCOVERY: Failed to parse agent file: {agent_file.name}")
                        except Exception as e:
                            print(f"❌ AGENT DISCOVERY: Error parsing agent file {agent_file}: {e}")
                            continue
                    else:
                        print(f"⏭️  AGENT DISCOVERY: Skipping file {agent_file.name} (not a valid agent file)")
                
                print(f"🎯 AGENT DISCOVERY: Total agents discovered: {len(discovered_agents)}")
                            
            except subprocess.CalledProcessError as e:
                print(f"❌ AGENT DISCOVERY: Error cloning repository {git_repo}")
                print(f"❌ AGENT DISCOVERY: Return code: {e.returncode}")
                print(f"❌ AGENT DISCOVERY: stdout: {e.stdout.decode() if e.stdout else 'None'}")
                print(f"❌ AGENT DISCOVERY: stderr: {e.stderr.decode() if e.stderr else 'None'}")
            except Exception as e:
                print(f"❌ AGENT DISCOVERY: Unexpected error: {e}")
                
        print(f"🧹 AGENT DISCOVERY: Temp directory {temp_dir} will be cleaned up")
        return discovered_agents
    
    async def _parse_agent_file(self, agent_file: Path, workflow_id: str) -> Optional[Subagent]:
        """
        Parse an agent definition file and return a Subagent object
        """
        try:
            with open(agent_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if agent_file.suffix == '.json':
                data = json.loads(content)
            elif agent_file.suffix in ['.yaml', '.yml']:
                data = yaml.safe_load(content)
            elif agent_file.suffix == '.md':
                # Parse Markdown agent file (Claude Code format)
                data = self._parse_markdown_agent(content, agent_file.stem)
            else:
                print(f"❌ Unsupported file format: {agent_file.suffix}")
                return None
            
            # Extract agent name from filename if not specified
            agent_name = data.get('name', agent_file.stem.replace('-', '_'))
            
            # Parse capabilities
            capabilities = []
            for cap in data.get('capabilities', []):
                try:
                    if isinstance(cap, str):
                        # Try to match with enum values
                        cap_enum = SubagentCapability(cap.lower())
                        capabilities.append(cap_enum)
                    elif isinstance(cap, dict) and 'type' in cap:
                        cap_enum = SubagentCapability(cap['type'].lower())
                        capabilities.append(cap_enum)
                except ValueError:
                    # If not a standard capability, use CUSTOM
                    capabilities.append(SubagentCapability.CUSTOM)
            
            # Create Subagent object
            agent = Subagent(
                name=agent_name,
                description=data.get('description', f'Auto-discovered agent: {agent_name}'),
                system_prompt=data.get('system_prompt', data.get('prompt', '')),
                capabilities=capabilities or [SubagentCapability.CUSTOM],
                trigger_keywords=data.get('trigger_keywords', data.get('keywords', [])),
                parameters=data.get('parameters', {}),
                max_tokens=data.get('max_tokens', 4096),
                temperature=data.get('temperature', 0.7)
            )
            
            return agent
            
        except Exception as e:
            print(f"❌ Error parsing agent file {agent_file}: {e}")
            return None

    def _parse_markdown_agent(self, content: str, filename: str) -> Dict[str, Any]:
        """
        Parse a Markdown agent file (Claude Code format)
        """
        lines = content.split('\n')
        data = {}
        
        # Check for YAML frontmatter
        if lines[0].strip() == '---':
            # Find the end of frontmatter
            frontmatter_end = -1
            for i, line in enumerate(lines[1:], 1):
                if line.strip() == '---':
                    frontmatter_end = i
                    break
            
            if frontmatter_end > 0:
                # Parse YAML frontmatter
                frontmatter_content = '\n'.join(lines[1:frontmatter_end])
                try:
                    frontmatter_data = yaml.safe_load(frontmatter_content)
                    if frontmatter_data:
                        data.update(frontmatter_data)
                except Exception as e:
                    print(f"⚠️  Failed to parse frontmatter: {e}")
                
                # The rest is the system prompt
                remaining_content = '\n'.join(lines[frontmatter_end + 1:]).strip()
                if remaining_content and 'system_prompt' not in data:
                    data['system_prompt'] = remaining_content
            else:
                # No proper frontmatter end found, treat whole content as system prompt
                data['system_prompt'] = content
        else:
            # No frontmatter, try to extract info from content
            # Look for common patterns in Claude Code agent files
            
            # Extract title as name
            title_match = re.match(r'^#\s+(.+)', lines[0]) if lines else None
            if title_match and 'name' not in data:
                data['name'] = title_match.group(1).lower().replace(' ', '_').replace('-', '_')
            
            # Use filename as fallback name
            if 'name' not in data:
                data['name'] = filename.replace('-', '_')
            
            # Look for description in first paragraph
            description_lines = []
            content_started = False
            for line in lines:
                line = line.strip()
                if not line:
                    if content_started and description_lines:
                        break
                    continue
                if line.startswith('#'):
                    content_started = True
                    continue
                if content_started:
                    description_lines.append(line)
                    if len(' '.join(description_lines)) > 200:  # Limit description length
                        break
            
            if description_lines and 'description' not in data:
                data['description'] = ' '.join(description_lines)[:200] + ('...' if len(' '.join(description_lines)) > 200 else '')
            
            # The entire content becomes the system prompt
            data['system_prompt'] = content
        
        # Set defaults if not provided
        if 'name' not in data:
            data['name'] = filename.replace('-', '_')
        
        if 'description' not in data:
            data['description'] = f'Claude Code agent: {data["name"]}'
        
        if 'capabilities' not in data:
            # Infer capabilities from filename and content
            inferred_caps = []
            name_lower = data['name'].lower()
            content_lower = content.lower()
            
            if any(word in name_lower or word in content_lower for word in ['review', 'code', 'quality']):
                inferred_caps.append('code_review')
            if any(word in name_lower or word in content_lower for word in ['test', 'testing']):
                inferred_caps.append('testing')
            if any(word in name_lower or word in content_lower for word in ['doc', 'documentation']):
                inferred_caps.append('documentation')
            if any(word in name_lower or word in content_lower for word in ['security', 'audit']):
                inferred_caps.append('security_audit')
            if any(word in name_lower or word in content_lower for word in ['performance', 'optimization']):
                inferred_caps.append('performance_optimization')
            if any(word in name_lower or word in content_lower for word in ['refactor', 'refactoring']):
                inferred_caps.append('refactoring')
            if any(word in name_lower or word in content_lower for word in ['data', 'analysis']):
                inferred_caps.append('data_analysis')
            if any(word in name_lower or word in content_lower for word in ['api', 'design']):
                inferred_caps.append('api_design')
            
            data['capabilities'] = inferred_caps or ['custom']
        
        if 'trigger_keywords' not in data:
            # Extract potential keywords from name and description
            keywords = []
            name_words = data['name'].replace('_', ' ').split()
            keywords.extend(name_words)
            
            # Add some common trigger words based on capabilities
            for cap in data.get('capabilities', []):
                if cap == 'code_review':
                    keywords.extend(['review', 'audit', 'quality'])
                elif cap == 'testing':
                    keywords.extend(['test', 'validate', 'verify'])
                elif cap == 'documentation':
                    keywords.extend(['document', 'explain', 'readme'])
            
            data['trigger_keywords'] = list(set(keywords))[:10]  # Limit to 10 keywords
        
        print(f"🔍 MARKDOWN AGENT: Parsed {filename} -> name: {data.get('name')}, capabilities: {data.get('capabilities')}")
        
        return data
    
    async def sync_agents_to_database(self, agents: List[Subagent], workflow_id: str) -> Dict[str, str]:
        """
        Sync discovered agents to the database, avoiding duplicates
        """
        synced_agents = {}
        
        for agent in agents:
            try:
                # Check if agent already exists by name
                existing_agent = await self.db.get_subagent_by_name(agent.name)
                
                if existing_agent:
                    # Update existing agent
                    agent_id = existing_agent['id']
                    await self.db.update_subagent(agent_id, agent)
                    synced_agents[agent.name] = f"updated:{agent_id}"
                else:
                    # Create new agent
                    agent_id = await self.db.create_subagent(agent)
                    synced_agents[agent.name] = f"created:{agent_id}"
                    
            except Exception as e:
                print(f"Error syncing agent {agent.name}: {e}")
                synced_agents[agent.name] = f"error:{str(e)}"
                
        return synced_agents
    
    async def discover_and_sync_agents(self, git_repo: str, workflow_id: str) -> Dict[str, any]:
        """
        Complete flow: discover agents from repo and sync to database
        """
        try:
            # Discover agents
            discovered_agents = await self.discover_agents_from_repo(git_repo, workflow_id)
            
            if not discovered_agents:
                return {
                    "success": True,
                    "message": f"No agents found in {self.agents_folder_path}/ folder",
                    "discovered_count": 0,
                    "synced_agents": {}
                }
            
            # Sync to database
            synced_agents = await self.sync_agents_to_database(discovered_agents, workflow_id)
            
            return {
                "success": True,
                "message": f"Discovered and synced {len(discovered_agents)} agents",
                "discovered_count": len(discovered_agents),
                "synced_agents": synced_agents,
                "agents": [{"name": agent.name, "description": agent.description} for agent in discovered_agents]
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "discovered_count": 0,
                "synced_agents": {}
            }

    def get_example_agent_format(self) -> Dict[str, any]:
        """
        Return example agent definition formats for documentation
        """
        return {
            "json_example": {
                "name": "code_reviewer",
                "description": "Specialized agent for code review and quality analysis",
                "system_prompt": "You are a senior software engineer focused on code quality, best practices, and security. Review code thoroughly and provide constructive feedback.",
                "capabilities": ["code_review", "security_audit", "refactoring"],
                "trigger_keywords": ["review", "analyze", "audit", "quality"],
                "parameters": {
                    "focus_areas": ["security", "performance", "maintainability"],
                    "strictness": "high"
                },
                "max_tokens": 4096,
                "temperature": 0.3
            },
            "yaml_example": """
name: test_generator
description: Automated test generation and validation agent
system_prompt: |
  You are a testing specialist. Generate comprehensive test cases, 
  including unit tests, integration tests, and edge cases.
capabilities:
  - testing
  - code_review
trigger_keywords:
  - test
  - validate
  - verify
parameters:
  test_frameworks: ["pytest", "jest", "junit"]
  coverage_target: 90
max_tokens: 4096
temperature: 0.2
            """.strip(),
            "markdown_example": """---
name: documentation_specialist
description: Technical documentation and writing expert
capabilities:
  - documentation
  - code_review
trigger_keywords:
  - document
  - explain
  - readme
  - guide
max_tokens: 4096
temperature: 0.4
---

# Documentation Specialist

You are an expert technical writer and documentation specialist. Your role is to:

- Create clear, comprehensive documentation
- Explain complex technical concepts in simple terms
- Write user guides, API documentation, and README files
- Review existing documentation for clarity and completeness
- Ensure documentation follows best practices and standards

Focus on making technical information accessible to developers of all skill levels.""".strip(),
            "markdown_simple_example": """# Security Auditor

You are a cybersecurity expert focused on identifying security vulnerabilities and best practices.

## Responsibilities
- Perform security code reviews
- Identify potential vulnerabilities
- Recommend security improvements
- Ensure compliance with security standards

Always prioritize security over convenience and provide specific, actionable recommendations.""".strip()
        }