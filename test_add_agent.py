#!/usr/bin/env python3
"""Test script to verify add_agent is being called"""
import sys
sys.path.insert(0, '/app/src')

# Patch add_agent to add print statements
from agent_orchestrator import MultiAgentOrchestrator, AgentRole

original_add_agent = MultiAgentOrchestrator.add_agent

def patched_add_agent(self, name, system_prompt, role=AgentRole.WORKER, use_tools=None):
    print(f"🔧 PATCHED: add_agent called with name={name}, use_tools={use_tools}")
    result = original_add_agent(self, name, system_prompt, role, use_tools)
    print(f"🔧 PATCHED: Agent created with use_tools={result.use_tools}")
    return result

MultiAgentOrchestrator.add_agent = patched_add_agent

# Now test it
orch = MultiAgentOrchestrator()
agent = orch.add_agent("Test", "Test prompt with file operations", use_tools=True)
print(f"\n✅ Test completed. Agent use_tools={agent.use_tools}")

