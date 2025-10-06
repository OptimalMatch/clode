"""
Deployment Executor - Server-side orchestration execution engine
Executes deployed designs with full logging and error handling
"""

from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from agent_orchestrator import MultiAgentOrchestrator, AgentRole
from models import OrchestrationDesign, ExecutionLog
from database import Database
import asyncio
import json


class DeploymentExecutor:
    """Executes orchestration designs server-side"""
    
    def __init__(self, db: Database, model: str = "claude-sonnet-4-20250514", cwd: Optional[str] = None):
        self.db = db
        self.model = model
        self.cwd = cwd
        self.orchestrator = None
    
    async def execute_design(
        self,
        design: OrchestrationDesign,
        input_data: Optional[Dict[str, Any]],
        log_id: str
    ) -> Dict[str, Any]:
        """
        Execute a complete orchestration design
        
        Args:
            design: The orchestration design to execute
            input_data: Optional input data for the execution
            log_id: ExecutionLog ID for tracking progress
            
        Returns:
            Dict with execution results
        """
        start_time = datetime.utcnow()
        
        try:
            # Initialize orchestrator for this execution
            self.orchestrator = MultiAgentOrchestrator(model=self.model, cwd=self.cwd)
            
            # Update log status to running
            await self.db.update_execution_log(log_id, {
                "status": "running",
                "started_at": start_time
            })
            
            # Build execution order using topological sort
            blocks = design.blocks
            connections = design.connections
            
            print(f"🔍 Before topological sort:")
            print(f"   Blocks type: {type(blocks)}, length: {len(blocks)}")
            print(f"   First block type: {type(blocks[0])}")
            print(f"   First block: {blocks[0]}")
            
            execution_order = self._topological_sort(blocks, connections)
            print(f"✅ Topological sort complete: {execution_order}")
            
            # Context to pass data between blocks
            context = {
                "input": input_data or {},
                "results": {},
                "block_outputs": {}
            }
            
            # Execute blocks in order
            for block_id in execution_order:
                block = next((b for b in blocks if b["id"] == block_id), None)
                if not block:
                    continue
                
                print(f"🎯 Executing block: {block['data']['label']} ({block['type']})")
                print(f"   Block data keys: {block['data'].keys()}")
                print(f"   Block agents type: {type(block['data']['agents'])}")
                print(f"   Number of agents: {len(block['data']['agents'])}")
                
                # Get inputs from connected blocks
                block_input = self._get_block_inputs(block_id, connections, context)
                
                # Execute based on pattern type
                pattern = block["type"]
                if pattern == "sequential":
                    result = await self._execute_sequential(block, block_input, log_id)
                elif pattern == "parallel":
                    result = await self._execute_parallel(block, block_input, log_id)
                elif pattern == "hierarchical":
                    result = await self._execute_hierarchical(block, block_input, log_id)
                elif pattern == "debate":
                    result = await self._execute_debate(block, block_input, log_id)
                elif pattern == "routing":
                    result = await self._execute_routing(block, block_input, log_id)
                elif pattern == "reflection":
                    result = await self._execute_reflection(block, block_input, log_id, context)
                else:
                    raise ValueError(f"Unknown pattern type: {pattern}")
                
                # Store result in context
                context["results"][block_id] = result
                context["block_outputs"][block_id] = result
                
                print(f"✅ Block completed: {block['data']['label']}")
            
            # Execution complete
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            final_result = {
                "success": True,
                "results": context["results"],
                "duration_ms": duration_ms
            }
            
            await self.db.update_execution_log(log_id, {
                "status": "completed",
                "result_data": final_result,
                "completed_at": end_time,
                "duration_ms": duration_ms
            })
            
            return final_result
            
        except Exception as e:
            print(f"❌ Execution error: {e}")
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            error_result = {
                "success": False,
                "error": str(e),
                "duration_ms": duration_ms
            }
            
            await self.db.update_execution_log(log_id, {
                "status": "failed",
                "error": str(e),
                "result_data": error_result,
                "completed_at": end_time,
                "duration_ms": duration_ms
            })
            
            raise
    
    def _topological_sort(self, blocks: List[Dict], connections: List[Dict]) -> List[str]:
        """
        Sort blocks in execution order using topological sort
        
        Returns list of block IDs in execution order
        """
        # Build adjacency list
        graph: Dict[str, List[str]] = {block["id"]: [] for block in blocks}
        in_degree: Dict[str, int] = {block["id"]: 0 for block in blocks}
        
        for conn in connections:
            source_id = conn["source"]["blockId"]
            target_id = conn["target"]["blockId"]
            
            if source_id in graph and target_id in graph:
                graph[source_id].append(target_id)
                in_degree[target_id] += 1
        
        # Find blocks with no incoming edges
        queue = [block_id for block_id, degree in in_degree.items() if degree == 0]
        result = []
        
        while queue:
            current = queue.pop(0)
            result.append(current)
            
            for neighbor in graph[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        
        # Check for cycles
        if len(result) != len(blocks):
            raise ValueError("Cycle detected in block connections")
        
        return result
    
    def _get_block_inputs(self, block_id: str, connections: List[Dict], context: Dict) -> str:
        """Get formatted inputs from connected blocks"""
        # Find connections targeting this block
        incoming = [c for c in connections if c["target"]["blockId"] == block_id]
        
        if not incoming:
            return context["input"]
        
        # Format results from previous blocks
        inputs = []
        for conn in incoming:
            source_id = conn["source"]["blockId"]
            if source_id in context["block_outputs"]:
                result = context["block_outputs"][source_id]
                if isinstance(result, dict):
                    # Format nicely
                    inputs.append(json.dumps(result, indent=2))
                else:
                    inputs.append(str(result))
        
        return "\n\n---\n\n".join(inputs) if inputs else context["input"]
    
    async def _execute_sequential(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute sequential pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Build task with input
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents to orchestrator
        agent_names = []
        for agent in agents:
            self.orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            agent_names.append(agent["name"])
        
        # Execute
        result = await self.orchestrator.sequential_pipeline(full_task, agent_names)
        return result
    
    async def _execute_parallel(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute parallel pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        print(f"🔍 Parallel execution debug:")
        print(f"   Agents type: {type(agents)}")
        print(f"   First agent type: {type(agents[0]) if agents else 'No agents'}")
        print(f"   First agent keys: {agents[0].keys() if agents and isinstance(agents[0], dict) else 'Not a dict'}")
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents
        agent_names = []
        for i, agent in enumerate(agents):
            print(f"   Processing agent {i}: type={type(agent)}")
            if not isinstance(agent, dict):
                print(f"   ERROR: Agent is not a dict, it's: {agent[:100] if isinstance(agent, str) else agent}")
                raise ValueError(f"Agent {i} is not a dictionary")
            
            self.orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            agent_names.append(agent["name"])
        
        # Execute
        result = await self.orchestrator.parallel_pipeline(full_task, agent_names)
        return result
    
    async def _execute_hierarchical(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute hierarchical pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # First agent is manager, rest are workers
        manager = agents[0]
        workers = agents[1:]
        
        self.orchestrator.add_agent(
            name=manager["name"],
            system_prompt=manager["system_prompt"],
            role=AgentRole.MANAGER
        )
        
        worker_list = []
        for worker in workers:
            self.orchestrator.add_agent(
                name=worker["name"],
                system_prompt=worker["system_prompt"],
                role=AgentRole.WORKER
            )
            worker_list.append({
                "name": worker["name"],
                "system_prompt": worker["system_prompt"],
                "role": "worker"
            })
        
        # Execute
        result = await self.orchestrator.hierarchical_pipeline(
            full_task,
            manager["name"],
            worker_list
        )
        return result
    
    async def _execute_debate(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute debate pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        rounds = block["data"].get("rounds", 3)
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents
        debater_list = []
        for agent in agents:
            self.orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            debater_list.append({
                "name": agent["name"],
                "system_prompt": agent["system_prompt"],
                "role": agent.get("role", "specialist")
            })
        
        # Execute
        result = await self.orchestrator.debate_pipeline(
            full_task,
            debater_list,
            rounds=rounds
        )
        return result
    
    async def _execute_routing(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute routing pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # First agent is router, rest are specialists
        router = agents[0]
        specialists = agents[1:]
        
        self.orchestrator.add_agent(
            name=router["name"],
            system_prompt=router["system_prompt"],
            role=AgentRole.MODERATOR
        )
        
        specialist_list = []
        for specialist in specialists:
            self.orchestrator.add_agent(
                name=specialist["name"],
                system_prompt=specialist["system_prompt"],
                role=AgentRole.SPECIALIST
            )
            specialist_list.append({
                "name": specialist["name"],
                "system_prompt": specialist["system_prompt"],
                "role": "specialist"
            })
        
        # Execute
        result = await self.orchestrator.routing_pipeline(
            full_task,
            router["name"],
            specialist_list
        )
        return result
    
    async def _execute_reflection(self, block: Dict, block_input: Any, log_id: str, context: Dict) -> Dict[str, Any]:
        """Execute reflection pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Build context for reflection
        design_context = json.dumps(context.get("results", {}), indent=2)
        full_task = f"{task}\n\nDesign Context:\n{design_context}\n\nInput: {block_input}" if block_input else f"{task}\n\nDesign Context:\n{design_context}"
        
        # Add reflection agent
        for agent in agents:
            self.orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=AgentRole.SPECIALIST
            )
        
        # Execute as sequential (reflection agents analyze and provide feedback)
        agent_names = [a["name"] for a in agents]
        result = await self.orchestrator.sequential_pipeline(full_task, agent_names)
        return result
    
    def _map_role(self, role: str) -> AgentRole:
        """Map string role to AgentRole enum"""
        role_map = {
            "manager": AgentRole.MANAGER,
            "worker": AgentRole.WORKER,
            "specialist": AgentRole.SPECIALIST,
            "moderator": AgentRole.MODERATOR,
            "reflector": AgentRole.SPECIALIST  # Reflectors are specialists
        }
        return role_map.get(role, AgentRole.SPECIALIST)

