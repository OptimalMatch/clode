"""
Seed sample orchestration designs to showcase the Orchestration Designer capabilities
"""
import asyncio
from database import Database
from models import OrchestrationDesign

# List of sample design names for duplicate checking
SAMPLE_DESIGN_NAMES = [
    "Data Processing Pipeline",
    "Multi-Domain Analysis",
    "Automated Code Review System",
    "Technical Decision Framework",
    "Customer Support Routing System",
    "Research Paper Analysis Pipeline",
    "Full-Stack Development Workflow",
    "Self-Improving Prompt Optimization",
    "Simple Code Editor"
]

async def seed_sample_designs(force=False, silent=False, db=None, only_missing=False):
    """Create sample orchestration designs demonstrating various patterns
    
    Args:
        force (bool): If True, will seed even if designs already exist
        silent (bool): If True, suppress console output (useful when called via API)
        db (Database): Optional database instance to use. If None, creates a new one.
        only_missing (bool): If True, only seed designs that don't already exist (no duplicates)
    """
    if db is None:
        db = Database()
    
    # Check if SAMPLE designs already exist (not just any designs)
    all_designs = await db.get_orchestration_designs()
    existing_sample_names = [d.get('name') for d in all_designs if d.get('name') in SAMPLE_DESIGN_NAMES]
    
    if existing_sample_names and not force and not only_missing:
        if not silent:
            print("⚠️  Sample orchestration designs already exist in the database!")
            print(f"   Found {len(existing_sample_names)} existing sample design(s):")
            for name in existing_sample_names:
                print(f"     - {name}")
            print(f"\n   (You have {len(all_designs)} total designs, including {len(all_designs) - len(existing_sample_names)} custom designs)")
            print("\n   To re-seed anyway, run with --force flag:")
            print("   python seed_orchestration_designs.py --force")
            print("\n   This will add the sample designs again (creating duplicates).")
        return
    
    # Sample Design 1: Simple Sequential Pipeline
    design1 = OrchestrationDesign(
        name="Data Processing Pipeline",
        description="Sequential pipeline for data extraction, transformation, and analysis",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Data Processing Chain",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Data Extractor",
                            "system_prompt": "You extract raw data from the input. The previous agent's output is your input data source. Extract 3-5 key data points and format them as a simple list. IMPORTANT: Output ONLY the extracted data list. Do NOT describe what you would do - provide the actual extracted data that the next agent can work with.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-2",
                            "name": "Data Transformer",
                            "system_prompt": "You receive extracted data from the previous agent - that data is your input. Clean and normalize it into a structured format (max 5 lines). IMPORTANT: Output ONLY the transformed data. Do NOT ask questions - the input provided IS your data to transform.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-3",
                            "name": "Data Analyzer",
                            "system_prompt": "You receive transformed data from the previous agent - that data is your input to analyze. Generate 2-3 brief insights (max 3 sentences each). IMPORTANT: Output ONLY your analysis insights. Do NOT ask for more data - work with what is provided.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze this sample: User activity shows 1000 logins, 500 purchases, avg session 5min",
                    "git_repo": ""
                }
            }
        ],
        connections=[],
        git_repos=[]
    )
    
    # Sample Design 2: Parallel Processing System
    design2 = OrchestrationDesign(
        name="Multi-Domain Analysis",
        description="Parallel analysis across multiple domains with aggregation",
        blocks=[
            {
                "id": "block-1",
                "type": "parallel",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Parallel Analyzers",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Security Analyst",
                            "system_prompt": "You analyze security. Identify 2-3 security concerns from the task input (max 2 sentences each). Output ONLY your security findings list. Be specific and concise.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-2",
                            "name": "Performance Analyst",
                            "system_prompt": "You analyze performance. Identify 2-3 performance issues from the task input (max 2 sentences each). Output ONLY your performance findings list. Be specific and concise.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-3",
                            "name": "Cost Analyst",
                            "system_prompt": "You analyze costs. Identify 2-3 cost optimization opportunities from the task input (max 2 sentences each). Output ONLY your cost findings list. Be specific and concise.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-4",
                            "name": "UX Analyst",
                            "system_prompt": "You analyze UX. Identify 2-3 user experience improvements from the task input (max 2 sentences each). Output ONLY your UX findings list. Be specific and concise.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze a web app with: slow page loads, unencrypted data transfer, $500/mo hosting, and small mobile buttons"
                }
            },
            {
                "id": "block-2",
                "type": "sequential",
                "position": {"x": 400, "y": 50},
                "data": {
                    "label": "Results Aggregator",
                    "agents": [
                        {
                            "id": "agent-5",
                            "name": "Report Synthesizer",
                            "system_prompt": "You receive analysis results from all parallel agents - those results are your input. Create a brief synthesis (max 5 sentences) highlighting the top 3 priorities. IMPORTANT: Output ONLY the synthesized summary. Do NOT ask for clarification - work with the input provided.",
                            "role": "manager"
                        }
                    ],
                    "task": "Synthesize all analysis results"
                }
            }
        ],
        connections=[
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Sample Design 3: Hierarchical Code Review
    design3 = OrchestrationDesign(
        name="Automated Code Review System",
        description="Hierarchical review with manager delegating to specialized workers",
        blocks=[
            {
                "id": "block-1",
                "type": "hierarchical",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Code Review Team",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Review Manager",
                            "system_prompt": "You coordinate the code review. When delegating: output specific task descriptions for workers. When synthesizing: output a summary of all findings (max 5 sentences). IMPORTANT: Always output actual content - the task descriptions or the synthesis. Do NOT describe what you would do.",
                            "role": "manager"
                        },
                        {
                            "id": "agent-2",
                            "name": "Style Reviewer",
                            "system_prompt": "You review code style. When given code to review, identify 2-3 style issues (max 1 sentence each). Output ONLY your style findings list. Be concise and specific about formatting, naming, and conventions.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-3",
                            "name": "Logic Reviewer",
                            "system_prompt": "You review code logic. When given code to review, identify 2-3 logic concerns (max 1 sentence each). Output ONLY your logic findings list. Be concise and specific about algorithms and correctness.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-4",
                            "name": "Security Reviewer",
                            "system_prompt": "You review security. When given code to review, identify 2-3 security risks (max 1 sentence each). Output ONLY your security findings list. Be concise and specific about vulnerabilities.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-5",
                            "name": "Performance Reviewer",
                            "system_prompt": "You review performance. When given code to review, identify 2-3 performance issues (max 1 sentence each). Output ONLY your performance findings list. Be concise and specific about optimization.",
                            "role": "worker"
                        }
                    ],
                    "task": "Review this code: function getUserData(id) { for(let i=0; i<users.length; i++) { if(users[i].id==id) return users[i]; } }",
                    "rounds": 2
                }
            }
        ],
        connections=[],
        git_repos=[]
    )
    
    # Sample Design 4: Debate-Based Decision Making
    design4 = OrchestrationDesign(
        name="Technical Decision Framework",
        description="Debate pattern for evaluating technical decisions from multiple perspectives",
        blocks=[
            {
                "id": "block-1",
                "type": "debate",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Architecture Debate",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Microservices Advocate",
                            "system_prompt": "You are participating in a structured debate as the Microservices Advocate. The previous agent's response is context you're responding to. Make ONE concise argument for microservices (maximum 4 sentences). Focus on scalability, independence, and team autonomy. Be specific. Output ONLY your debate argument - nothing else.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-2",
                            "name": "Monolith Advocate",
                            "system_prompt": "You are participating in a structured debate as the Monolith Advocate. The previous agent's response is context you're responding to. Make ONE concise argument for monolithic architecture (maximum 4 sentences). Focus on simplicity, consistency, and easier debugging. Be specific. Output ONLY your debate argument - nothing else.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Debate: Build a new e-commerce platform with 5 developers, expected to scale to 10k daily users",
                    "rounds": 3
                }
            },
            {
                "id": "block-2",
                "type": "sequential",
                "position": {"x": 400, "y": 50},
                "data": {
                    "label": "Decision Maker",
                    "agents": [
                        {
                            "id": "agent-3",
                            "name": "Technical Lead",
                            "system_prompt": "You receive debate arguments from both advocates - those arguments are your input. Make a final decision and provide brief reasoning (max 4 sentences). IMPORTANT: Output ONLY your decision and reasoning. Do NOT ask for more information - decide based on the arguments provided.",
                            "role": "manager"
                        }
                    ],
                    "task": "Make final architecture decision"
                }
            }
        ],
        connections=[
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Sample Design 5: Complex Router System
    design5 = OrchestrationDesign(
        name="Customer Support Routing System",
        description="Intelligent routing to specialized support chains based on request type",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Request Intake",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Request Classifier",
                            "system_prompt": "You classify support requests. From the task input, identify: (1) Category (Technical/Billing/General), (2) Key issue in 1 sentence. Output ONLY those 2 items. Be concise.",
                            "role": "worker"
                        }
                    ],
                    "task": "Customer says: 'My credit card was charged twice for last month's subscription'"
                }
            },
            {
                "id": "block-2",
                "type": "routing",
                "position": {"x": 400, "y": 50},
                "data": {
                    "label": "Support Router",
                    "agents": [
                        {
                            "id": "agent-2",
                            "name": "Routing Agent",
                            "system_prompt": "You route support requests. You receive classification from the previous agent - that is your input. Output: (1) Which specialist to route to (Technical/Billing/General), (2) Brief reason (1 sentence). Be concise (max 2 sentences total).",
                            "role": "moderator"
                        }
                    ],
                    "task": "Route based on classification"
                }
            },
            {
                "id": "block-3",
                "type": "sequential",
                "position": {"x": 200, "y": 250},
                "data": {
                    "label": "Technical Support Chain",
                    "agents": [
                        {
                            "id": "agent-3",
                            "name": "Technical Specialist",
                            "system_prompt": "You handle technical issues. Provide 2-3 quick troubleshooting steps (max 1 sentence each). Output ONLY the steps list. Be specific and actionable.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-4",
                            "name": "QA Reviewer",
                            "system_prompt": "You review solutions. The previous agent's output is your input to review. Verify the steps are clear and complete (max 2 sentences). Output ONLY your review. Do NOT ask questions - work with what is provided.",
                            "role": "worker"
                        }
                    ],
                    "task": "Resolve technical issue"
                }
            },
            {
                "id": "block-4",
                "type": "sequential",
                "position": {"x": 500, "y": 250},
                "data": {
                    "label": "Billing Support Chain",
                    "agents": [
                        {
                            "id": "agent-5",
                            "name": "Billing Specialist",
                            "system_prompt": "You handle billing issues. Provide 2-3 action steps to resolve (max 1 sentence each). Output ONLY the action steps list. Be specific and clear.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Resolve billing issue"
                }
            },
            {
                "id": "block-5",
                "type": "sequential",
                "position": {"x": 750, "y": 250},
                "data": {
                    "label": "General Support Chain",
                    "agents": [
                        {
                            "id": "agent-6",
                            "name": "General Support Agent",
                            "system_prompt": "You handle general inquiries. Provide a helpful response (max 3 sentences). Output ONLY your response. Be friendly and informative.",
                            "role": "worker"
                        }
                    ],
                    "task": "Handle general inquiry"
                }
            }
        ],
        connections=[
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "type": "block"
            },
            {
                "id": "conn-2",
                "source": "block-2",
                "target": "block-3",
                "type": "block"
            },
            {
                "id": "conn-3",
                "source": "block-2",
                "target": "block-4",
                "type": "block"
            },
            {
                "id": "conn-4",
                "source": "block-2",
                "target": "block-5",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Sample Design 6: Advanced Agent-Level Connections
    design6 = OrchestrationDesign(
        name="Research Paper Analysis Pipeline",
        description="Complex workflow with agent-level connections for specialized processing",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Document Processors",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "PDF Extractor",
                            "system_prompt": "You extract content from documents. From the input, extract 2-3 key sections (title, abstract snippet, 1 citation). Output ONLY the extracted content as a simple list.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-2",
                            "name": "Abstract Analyzer",
                            "system_prompt": "You receive extracted content from the previous agent - that is your input. Identify 2-3 key concepts (max 1 sentence each). Output ONLY the concepts list. Do NOT ask for more context - work with what is provided.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-3",
                            "name": "Citation Extractor",
                            "system_prompt": "You receive extracted content from earlier agents - that is your input. List 1-2 citations found (author, year format). Output ONLY the citations list. Be concise.",
                            "role": "worker"
                        }
                    ],
                    "task": "Paper: 'Machine Learning in Healthcare (2024)' Abstract: AI models predict patient outcomes. Citations: Smith 2023, Jones 2022"
                }
            },
            {
                "id": "block-2",
                "type": "parallel",
                "position": {"x": 450, "y": 50},
                "data": {
                    "label": "Specialized Analyzers",
                    "agents": [
                        {
                            "id": "agent-4",
                            "name": "Methodology Analyst",
                            "system_prompt": "You analyze methodology. You receive key concepts - that is your input. Identify 1-2 methodology points (max 1 sentence each). Output ONLY your findings list. Be specific.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-5",
                            "name": "Results Analyst",
                            "system_prompt": "You analyze results. You receive key concepts - that is your input. Identify 1-2 result highlights (max 1 sentence each). Output ONLY your findings list. Be specific.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-6",
                            "name": "Literature Reviewer",
                            "system_prompt": "You review literature context. You receive citations - that is your input. Provide 1-2 context points (max 1 sentence each). Output ONLY your context list. Be brief.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze paper components"
                }
            },
            {
                "id": "block-3",
                "type": "hierarchical",
                "position": {"x": 250, "y": 350},
                "data": {
                    "label": "Synthesis Team",
                    "agents": [
                        {
                            "id": "agent-7",
                            "name": "Research Synthesizer",
                            "system_prompt": "You synthesize analysis. When delegating: output specific tasks. When synthesizing: create a brief summary (max 4 sentences). IMPORTANT: Always output actual content. Do NOT describe what you would do.",
                            "role": "manager"
                        },
                        {
                            "id": "agent-8",
                            "name": "Quality Checker",
                            "system_prompt": "You check quality. When given content to check, verify 2 key aspects (max 1 sentence each). Output ONLY your verification points. Be specific.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-9",
                            "name": "Report Generator",
                            "system_prompt": "You generate reports. When given synthesis to format, create a brief structured output (max 4 lines). Output ONLY the formatted report. Be concise.",
                            "role": "worker"
                        }
                    ],
                    "task": "Create final synthesis",
                    "rounds": 2
                }
            }
        ],
        connections=[
            # Agent-level connections showing fine-grained routing
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "sourceAgent": "agent-2",  # Abstract Analyzer
                "targetAgent": "agent-4",  # Methodology Analyst
                "type": "agent"
            },
            {
                "id": "conn-2",
                "source": "block-1",
                "target": "block-2",
                "sourceAgent": "agent-2",  # Abstract Analyzer
                "targetAgent": "agent-5",  # Results Analyst
                "type": "agent"
            },
            {
                "id": "conn-3",
                "source": "block-1",
                "target": "block-2",
                "sourceAgent": "agent-3",  # Citation Extractor
                "targetAgent": "agent-6",  # Literature Reviewer
                "type": "agent"
            },
            {
                "id": "conn-4",
                "source": "block-2",
                "target": "block-3",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Sample Design 7: Multi-Stage Development Workflow
    design7 = OrchestrationDesign(
        name="Full-Stack Development Workflow",
        description="Complete development cycle from requirements to deployment",
        blocks=[
            {
                "id": "block-1",
                "type": "debate",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Requirements Discussion",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Product Manager",
                            "system_prompt": "You are participating in a structured debate as the Product Manager. The previous agent's response is context you're responding to. Make ONE concise point about product requirements and user needs (maximum 3 sentences). Be specific. Output ONLY your argument - nothing else.",
                            "role": "manager"
                        },
                        {
                            "id": "agent-2",
                            "name": "Technical Architect",
                            "system_prompt": "You are participating in a structured debate as the Technical Architect. The previous agent's response is context you're responding to. Make ONE concise point about technical feasibility and constraints (maximum 3 sentences). Be specific. Output ONLY your argument - nothing else.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Feature request: Add user dashboard with real-time analytics",
                    "rounds": 2
                }
            },
            {
                "id": "block-2",
                "type": "parallel",
                "position": {"x": 450, "y": 50},
                "data": {
                    "label": "Implementation Teams",
                    "agents": [
                        {
                            "id": "agent-3",
                            "name": "Frontend Developer",
                            "system_prompt": "You implement frontend features. List 2-3 key implementation tasks (max 1 sentence each). Output ONLY your task list. Be specific about UI components.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-4",
                            "name": "Backend Developer",
                            "system_prompt": "You implement backend APIs. List 2-3 key API endpoints needed (max 1 sentence each). Output ONLY your endpoint list. Be specific about functionality.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-5",
                            "name": "Database Engineer",
                            "system_prompt": "You design database schema. List 2-3 key tables/collections needed (max 1 sentence each). Output ONLY your schema list. Be specific about data structure.",
                            "role": "worker"
                        }
                    ],
                    "task": "Implement user dashboard feature"
                }
            },
            {
                "id": "block-3",
                "type": "hierarchical",
                "position": {"x": 200, "y": 300},
                "data": {
                    "label": "QA & Testing",
                    "agents": [
                        {
                            "id": "agent-6",
                            "name": "QA Lead",
                            "system_prompt": "You coordinate testing. When delegating: output specific test areas for workers. When synthesizing: summarize test coverage (max 3 sentences). IMPORTANT: Always output actual content. Do NOT describe what you would do.",
                            "role": "manager"
                        },
                        {
                            "id": "agent-7",
                            "name": "Unit Test Engineer",
                            "system_prompt": "You write unit tests. When given test tasks, list 2-3 unit test cases (max 1 sentence each). Output ONLY your test list. Be specific.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-8",
                            "name": "Integration Test Engineer",
                            "system_prompt": "You write integration tests. When given test tasks, list 2 integration test scenarios (max 1 sentence each). Output ONLY your test list. Be specific.",
                            "role": "worker"
                        },
                        {
                            "id": "agent-9",
                            "name": "E2E Test Engineer",
                            "system_prompt": "You write E2E tests. When given test tasks, list 2 user journey tests (max 1 sentence each). Output ONLY your test list. Be specific.",
                            "role": "worker"
                        }
                    ],
                    "task": "Test dashboard feature",
                    "rounds": 2
                }
            },
            {
                "id": "block-4",
                "type": "sequential",
                "position": {"x": 600, "y": 300},
                "data": {
                    "label": "Deployment Pipeline",
                    "agents": [
                        {
                            "id": "agent-10",
                            "name": "DevOps Engineer",
                            "system_prompt": "You configure deployment. List 2-3 deployment steps (max 1 sentence each). Output ONLY your deployment checklist. Be specific and actionable.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-11",
                            "name": "Deployment Validator",
                            "system_prompt": "You validate deployment. The previous agent's output is your checklist. Verify 2-3 smoke tests (max 1 sentence each). Output ONLY your validation results. Do NOT ask for info - work with what is provided.",
                            "role": "worker"
                        }
                    ],
                    "task": "Deploy dashboard to production"
                }
            }
        ],
        connections=[
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "type": "block"
            },
            {
                "id": "conn-2",
                "source": "block-2",
                "target": "block-3",
                "type": "block"
            },
            {
                "id": "conn-3",
                "source": "block-3",
                "target": "block-4",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Sample Design 8: Reflection-based Prompt Optimization
    design8 = OrchestrationDesign(
        name="Self-Improving Prompt Optimization",
        description="Uses reflection agents to analyze and improve orchestration prompts for better performance",
        blocks=[
            {
                "id": "block-1",
                "type": "parallel",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "API Analysis Team",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Security Checker",
                            "system_prompt": "Check API security. List 2-3 issues.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-2",
                            "name": "Performance Checker",
                            "system_prompt": "Check API performance. List 2-3 issues.",
                            "role": "specialist"
                        },
                        {
                            "id": "agent-3",
                            "name": "Design Checker",
                            "system_prompt": "Check API design quality. List 2-3 issues.",
                            "role": "specialist"
                        }
                    ],
                    "task": "Analyze this REST API: GET /users/:id returns full user object with password hash, no rate limiting, SQL query in URL parameter",
                    "git_repo": ""
                }
            },
            {
                "id": "block-2",
                "type": "reflection",
                "position": {"x": 450, "y": 50},
                "data": {
                    "label": "Prompt Optimizer",
                    "agents": [
                        {
                            "id": "agent-4",
                            "name": "Reflection Agent",
                            "system_prompt": "You are a prompt engineering expert. Analyze the agent prompts in this orchestration and their execution results. For agents whose prompts are too vague or could be improved, suggest specific, concrete improvements. Consider: 1) Are prompts explicit enough about output format? 2) Do they constrain scope appropriately? 3) Do they prevent the agent from straying off-task? 4) Are there clear success criteria? Output your analysis as JSON with this structure: {\"suggestions\": [{\"blockId\": \"...\", \"agentId\": \"...\", \"agentName\": \"...\", \"currentPrompt\": \"...\", \"suggestedPrompt\": \"...\", \"reasoning\": \"...\"}]}. Be specific and actionable in your suggestions.",
                            "role": "reflector"
                        }
                    ],
                    "task": "Analyze all agent prompts and suggest improvements to make them more effective, explicit, and reliable",
                    "git_repo": ""
                }
            }
        ],
        connections=[
            {
                "id": "conn-1",
                "source": "block-1",
                "target": "block-2",
                "type": "block"
            }
        ],
        git_repos=[]
    )
    
    # Design 9: Simple Code Editor (for Code Editor Page)
    design9 = OrchestrationDesign(
        name="Simple Code Editor",
        description="Simple 2-agent design for code editing tasks. Works with Code Editor page's editor_* tools. Handles creating, updating, and fixing code efficiently.",
        blocks=[
            {
                "id": "block-1",
                "type": "sequential",
                "position": {"x": 50, "y": 50},
                "data": {
                    "label": "Code Analysis and Editing",
                    "agents": [
                        {
                            "id": "agent-1",
                            "name": "Code Analyzer",
                            "system_prompt": """Analyze the user's request and understand what needs to be done.

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_browse_directory
- mcp__workflow-manager__editor_read_file  
- mcp__workflow-manager__editor_search_files

NEVER use: read_file, glob, or any generic file tools.

EXAMPLE:
Tool: mcp__workflow-manager__editor_browse_directory
Args: {"workflow_id": "<provided_in_task>", "path": ""}

Your job: Analyze what files exist, what needs to be changed, and provide a clear plan.
Output: A brief plan of what will be done (2-3 sentences).""",
                            "role": "specialist",
                            "use_tools": True
                        },
                        {
                            "id": "agent-2", 
                            "name": "Code Editor",
                            "system_prompt": """Execute the code changes based on the analysis.

CRITICAL TOOL USAGE:
====================
ONLY use these MCP tools (full names):
- mcp__workflow-manager__editor_read_file
- mcp__workflow-manager__editor_create_change
- mcp__workflow-manager__editor_get_changes

NEVER use: write_file, read_file, or any generic file tools.

EXAMPLE WORKFLOW:
1. Read: mcp__workflow-manager__editor_read_file
   Args: {"workflow_id": "<from_task>", "file_path": "README.md"}

2. Create change: mcp__workflow-manager__editor_create_change
   Args: {
     "workflow_id": "<from_task>",
     "file_path": "README.md",
     "operation": "update",
     "new_content": "<FULL FILE CONTENT>"
   }

3. Verify: mcp__workflow-manager__editor_get_changes
   Args: {"workflow_id": "<from_task>"}

Operations: 'create', 'update', or 'delete'

Your job: Create pending changes (NOT direct file writes).
Output: Confirm the change_id from the tool response.""",
                            "role": "specialist",
                            "use_tools": True
                        }
                    ],
                    "task": "Analyze code requirements and implement changes using editor tools"
                }
            }
        ],
        connections=[],
        git_repos=[]
    )
    
    # Insert all designs
    all_sample_designs = [design1, design2, design3, design4, design5, design6, design7, design8, design9]
    
    # Filter to only missing designs if requested
    if only_missing:
        designs = [d for d in all_sample_designs if d.name not in existing_sample_names]
        if not silent and len(designs) > 0:
            print(f"🌱 Seeding {len(designs)} missing orchestration design(s)...")
        elif not silent:
            print("✅ All sample designs already exist!")
            return
    else:
        designs = all_sample_designs
        if not silent:
            print("🌱 Seeding orchestration designs...")
    
    for i, design in enumerate(designs, 1):
        try:
            design_id = await db.create_orchestration_design(design)
            if not silent:
                print(f"✅ Created design {i}/{len(designs)}: {design.name} (ID: {design_id})")
        except Exception as e:
            if not silent:
                print(f"❌ Failed to create design {i}/{len(designs)}: {design.name} - {str(e)}")
    
    if not silent:
        if force:
            print("\n🎉 Seeding complete (forced)!")
        elif only_missing:
            print("\n🎉 Missing designs added!")
        else:
            print("\n🎉 Seeding complete!")
        
        print(f"📊 Total designs created: {len(designs)}")
        print("\n📋 Summary:")
        print("  1. Data Processing Pipeline - Simple sequential workflow")
        print("  2. Multi-Domain Analysis - Parallel processing with aggregation")
        print("  3. Automated Code Review System - Hierarchical delegation")
        print("  4. Technical Decision Framework - Debate-based decision making")
        print("  5. Customer Support Routing System - Complex routing with branches")
        print("  6. Research Paper Analysis Pipeline - Agent-level connections")
        print("  7. Full-Stack Development Workflow - Multi-stage complete cycle")
        print("  8. Self-Improving Prompt Optimization - Reflection agent analyzing prompts")
        print("  9. Simple Code Editor - Optimized for Code Editor page file operations")
        print("\n💡 Next steps:")
        print("  1. Start the backend server (if not already running)")
        print("  2. Open the Orchestration Designer in the UI")
        print("  3. Click 'Load Design' to see and explore the sample designs")

if __name__ == "__main__":
    import sys
    
    # Check for --force flag
    force = "--force" in sys.argv or "-f" in sys.argv
    
    asyncio.run(seed_sample_designs(force=force))

