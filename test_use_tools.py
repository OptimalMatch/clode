#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app/src')
from models import OrchestrationAgent

# Test agent parsing
agent_data = {
    'name': 'Test Agent',
    'system_prompt': 'Test prompt with file operations',
    'role': 'specialist',
    'use_tools': True
}

agent = OrchestrationAgent(**agent_data)
print(f'Agent name: {agent.name}')
print(f'Agent use_tools: {agent.use_tools}')
print(f'Type: {type(agent.use_tools)}')
print(f'Has attr: {hasattr(agent, "use_tools")}')
print(f'Getattr: {getattr(agent, "use_tools", None)}')

