#!/usr/bin/env python3
"""
Seed Voice Conversation orchestration design

This design demonstrates the voice MCP integration with Claude agents
that can transcribe speech, process requests, and synthesize responses.
"""
import asyncio
from database import Database
from models import OrchestrationDesign

async def seed_voice_conversation_design():
    """Seed Voice Conversation Assistant design"""
    db = Database()
    await db.connect()

    # Create a sequential design with 3 agents for voice interaction
    design = OrchestrationDesign(
        name="Voice Conversation Assistant",
        description="Demonstrates voice MCP integration with agents that can listen, think, and speak. Uses transcribe_audio and synthesize_speech MCP tools.",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Voice Interaction Pipeline",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Voice Listener",
                            "system_prompt": """You are a Voice Listener agent. Your job is to transcribe user audio input to text.

CRITICAL TOOL USAGE:
====================
You have access to the voice-interaction MCP server with these tools:
- mcp__voice-interaction__transcribe_audio
- mcp__voice-interaction__synthesize_speech
- mcp__voice-interaction__voice_conversation
- mcp__voice-interaction__check_voice_api_health

YOUR PRIMARY TASK:
==================
When you receive audio data, use the transcribe_audio tool:

Tool: mcp__voice-interaction__transcribe_audio
Args: {
  "audio_data": "<base64_encoded_audio>"
}

The audio_data will be provided in the task input as a base64-encoded PCM float32 audio at 16kHz.

WORKFLOW:
=========
1. Check if audio_data is provided in the task
2. If yes, call transcribe_audio with the audio_data
3. Return the transcribed text clearly
4. If no audio_data, explain what you're waiting for

EXAMPLE:
========
Input: { "audio_data": "SGVsbG8gd29ybGQ..." }
Action: Call mcp__voice-interaction__transcribe_audio
Output: "I heard you say: [transcribed text]"

Remember: Your output will be passed to the next agent for processing.""",
                            "role": "specialist",
                            "use_tools": True
                        },
                        {
                            "id": "agent-2",
                            "name": "Conversation Handler",
                            "system_prompt": """You are a Conversation Handler agent. You receive transcribed user input and generate helpful responses.

YOUR ROLE:
==========
- Receive the transcribed text from the Voice Listener agent
- Understand the user's request or question
- Generate a clear, helpful, and conversational response
- Keep responses concise (2-3 sentences max) for voice output

IMPORTANT:
==========
- You DO NOT use voice tools yourself
- Focus on understanding and responding to the user's intent
- Your text response will be synthesized to speech by the next agent
- Be conversational and natural, as this will be spoken aloud

EXAMPLE FLOW:
=============
Input from previous agent: "I heard you say: What's the weather today?"
Your task: Understand and respond
Your output: "I'm an AI assistant and don't have real-time weather data. However, I can help you with coding tasks, answer questions, or have a conversation!"

Keep it friendly and natural!""",
                            "role": "specialist",
                            "use_tools": False
                        },
                        {
                            "id": "agent-3",
                            "name": "Voice Speaker",
                            "system_prompt": """You are a Voice Speaker agent. Your job is to convert text responses into speech audio.

CRITICAL TOOL USAGE:
====================
You have access to the voice-interaction MCP server with these tools:
- mcp__voice-interaction__synthesize_speech
- mcp__voice-interaction__transcribe_audio
- mcp__voice-interaction__voice_conversation
- mcp__voice-interaction__check_voice_api_health

YOUR PRIMARY TASK:
==================
When you receive a text response, use the synthesize_speech tool:

Tool: mcp__voice-interaction__synthesize_speech
Args: {
  "text": "<text_to_speak>"
}

The tool will return base64-encoded WAV audio that can be played in the browser.

WORKFLOW:
=========
1. Extract the response text from the previous agent's output
2. Call synthesize_speech with that text
3. Return the audio data along with a confirmation message
4. The frontend will play the audio automatically

EXAMPLE:
========
Input: "I'm an AI assistant and can help with coding tasks!"
Action: Call mcp__voice-interaction__synthesize_speech
Output: "I've synthesized the response. Here's the audio: [base64_audio_data]"

IMPORTANT:
==========
- Always synthesize the text from the previous agent
- Return both a message AND the audio data
- The audio format will be WAV (base64-encoded)

Your output completes the voice conversation loop: Listen → Think → Speak""",
                            "role": "specialist",
                            "use_tools": True
                        }
                    ],
                    "task": "Complete voice conversation: transcribe user audio, process the request, and synthesize a spoken response"
                }
            }
        ],
        connections=[],
        git_repos=[],
        metadata={
            "category": "Voice Integration",
            "difficulty": "Intermediate",
            "requires_mcp": ["voice-interaction"],
            "demo_compatible": True,
            "description": "This design showcases the voice MCP server integration. The Voice Listener transcribes speech, Conversation Handler generates a response, and Voice Speaker synthesizes the reply as audio."
        }
    )

    # Check if already exists
    existing_designs = await db.get_all_orchestration_designs()
    for existing in existing_designs:
        if existing.get("name") == design.name:
            print(f"✅ Voice Conversation design already exists (ID: {existing.get('id')})")
            # Update it
            await db.update_orchestration_design(existing.get("id"), design)
            print(f"✅ Updated Voice Conversation design")
            await db.close()
            return existing.get("id")

    # Create the design
    result = await db.create_orchestration_design(design)
    design_id = result.get('id')
    print(f"✅ Created Voice Conversation design (ID: {design_id})")

    await db.close()
    return design_id

if __name__ == "__main__":
    design_id = asyncio.run(seed_voice_conversation_design())
    print(f"\n🎤 Voice Conversation Assistant design ready!")
    print(f"   Design ID: {design_id}")
    print(f"   Deploy it via: POST /api/orchestration-designs/{design_id}/deploy")
