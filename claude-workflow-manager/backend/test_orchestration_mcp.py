#!/usr/bin/env python3
"""
Test script for Agent Orchestration MCP tools.

This script demonstrates how to call the orchestration MCP tools
to verify they're working correctly.
"""

import asyncio
import httpx
import json


BASE_URL = "http://localhost:8005"


async def test_sequential_pipeline():
    """Test sequential pipeline orchestration."""
    print("=" * 60)
    print("Testing Sequential Pipeline")
    print("=" * 60)
    
    request_data = {
        "task": "Write a brief product description for an eco-friendly water bottle",
        "agents": [
            {
                "name": "Feature Researcher",
                "system_prompt": "You research product features. List 3-5 key features of eco-friendly water bottles. Be concise.",
                "role": "worker"
            },
            {
                "name": "Copywriter",
                "system_prompt": "You write marketing copy. Transform the features into compelling product description (2-3 sentences).",
                "role": "worker"
            }
        ],
        "agent_sequence": ["Feature Researcher", "Copywriter"],
        "model": "claude-sonnet-4-20250514"
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/orchestration/sequential",
            json=request_data
        )
        result = response.json()
        
        print(f"\nStatus: {result['status']}")
        print(f"Duration: {result['duration_ms']}ms")
        print(f"\nFinal Result:\n{result['result']['final_result']}")
        print("\n")


async def test_debate():
    """Test debate orchestration."""
    print("=" * 60)
    print("Testing Debate Pattern")
    print("=" * 60)
    
    request_data = {
        "topic": "Is remote work or office work better for productivity?",
        "agents": [
            {
                "name": "Remote Advocate",
                "system_prompt": "You advocate for remote work. Present concise arguments (max 3 sentences). Focus on flexibility and focus.",
                "role": "worker"
            },
            {
                "name": "Office Advocate",
                "system_prompt": "You advocate for office work. Present concise arguments (max 3 sentences). Focus on collaboration and culture.",
                "role": "worker"
            },
            {
                "name": "Moderator",
                "system_prompt": "You summarize both perspectives neutrally (max 3 sentences). Identify key trade-offs.",
                "role": "moderator"
            }
        ],
        "participant_names": ["Remote Advocate", "Office Advocate", "Moderator"],
        "rounds": 2,
        "model": "claude-sonnet-4-20250514"
    }
    
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/orchestration/debate",
            json=request_data
        )
        result = response.json()
        
        print(f"\nStatus: {result['status']}")
        print(f"Duration: {result['duration_ms']}ms")
        print(f"\nDebate History:")
        for entry in result['result']['debate_history']:
            print(f"\nRound {entry['round']} - {entry['agent']}:")
            print(f"{entry['statement'][:200]}...")
        print("\n")


async def test_hierarchical():
    """Test hierarchical orchestration."""
    print("=" * 60)
    print("Testing Hierarchical Pattern")
    print("=" * 60)
    
    request_data = {
        "task": "Create a quick social media content plan",
        "manager": {
            "name": "Content Manager",
            "system_prompt": "You delegate content tasks to specialists, then synthesize their work into a cohesive plan.",
            "role": "manager"
        },
        "workers": [
            {
                "name": "Instagram Specialist",
                "system_prompt": "You create Instagram content ideas. Suggest 2-3 post concepts. Be brief.",
                "role": "worker"
            },
            {
                "name": "Twitter Specialist",
                "system_prompt": "You create Twitter content ideas. Suggest 2-3 tweet concepts. Be brief.",
                "role": "worker"
            }
        ],
        "worker_names": ["Instagram Specialist", "Twitter Specialist"],
        "model": "claude-sonnet-4-20250514"
    }
    
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/orchestration/hierarchical",
            json=request_data
        )
        result = response.json()
        
        print(f"\nStatus: {result['status']}")
        print(f"Duration: {result['duration_ms']}ms")
        print(f"\nFinal Synthesized Plan:\n{result['result']['final_result'][:300]}...")
        print("\n")


async def test_parallel():
    """Test parallel aggregation orchestration."""
    print("=" * 60)
    print("Testing Parallel Aggregation Pattern")
    print("=" * 60)
    
    request_data = {
        "task": "Quick brainstorm: Best way to learn Python?",
        "agents": [
            {
                "name": "Self-Taught Developer",
                "system_prompt": "You learned Python through online tutorials. Share your approach (2-3 sentences).",
                "role": "worker"
            },
            {
                "name": "CS Professor",
                "system_prompt": "You teach Python academically. Share your recommended approach (2-3 sentences).",
                "role": "worker"
            }
        ],
        "agent_names": ["Self-Taught Developer", "CS Professor"],
        "aggregator": {
            "name": "Learning Advisor",
            "system_prompt": "You synthesize different learning approaches into balanced advice (3-4 sentences).",
            "role": "manager"
        },
        "aggregator_name": "Learning Advisor",
        "model": "claude-sonnet-4-20250514"
    }
    
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/orchestration/parallel",
            json=request_data
        )
        result = response.json()
        
        print(f"\nStatus: {result['status']}")
        print(f"Duration: {result['duration_ms']}ms")
        print(f"\nAggregated Result:\n{result['result']['aggregated_result']}")
        print("\n")


async def test_dynamic_routing():
    """Test dynamic routing orchestration."""
    print("=" * 60)
    print("Testing Dynamic Routing Pattern")
    print("=" * 60)
    
    request_data = {
        "task": "My website loads slowly. What should I check?",
        "router": {
            "name": "Support Router",
            "system_prompt": "You route support issues to specialists. Analyze the issue and output JSON: {\"selected_agents\": [\"agent\"], \"reasoning\": \"why\"}. Be concise.",
            "role": "manager"
        },
        "specialists": [
            {
                "name": "Performance Expert",
                "system_prompt": "You diagnose web performance issues. Provide 3-4 quick checks for slow website loading.",
                "role": "specialist"
            },
            {
                "name": "Code Expert",
                "system_prompt": "You diagnose code quality issues. Provide 3-4 quick code-related checks.",
                "role": "specialist"
            }
        ],
        "specialist_names": ["Performance Expert", "Code Expert"],
        "model": "claude-sonnet-4-20250514"
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/orchestration/routing",
            json=request_data
        )
        result = response.json()
        
        print(f"\nStatus: {result['status']}")
        print(f"Duration: {result['duration_ms']}ms")
        print(f"\nSelected Agent(s): {result['result']['selected_agents']}")
        print(f"Reasoning: {result['result']['reasoning']}")
        print(f"\nResults:")
        for agent, response in result['result']['results'].items():
            print(f"\n{agent}:\n{response[:200]}...")
        print("\n")


async def main():
    """Run all tests."""
    print("\n🚀 Testing Agent Orchestration Endpoints\n")
    
    tests = [
        ("Sequential Pipeline", test_sequential_pipeline),
        ("Debate", test_debate),
        ("Hierarchical", test_hierarchical),
        ("Parallel Aggregation", test_parallel),
        ("Dynamic Routing", test_dynamic_routing),
    ]
    
    for test_name, test_func in tests:
        try:
            await test_func()
        except Exception as e:
            print(f"❌ {test_name} failed: {e}\n")
            continue
    
    print("✅ All tests completed!\n")


if __name__ == "__main__":
    asyncio.run(main())

