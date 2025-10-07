"""
Deployment Executor - Server-side orchestration execution engine
Executes deployed designs with full logging and error handling
"""

from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from agent_orchestrator import MultiAgentOrchestrator, AgentRole, ensure_orchestration_credentials
from models import OrchestrationDesign, ExecutionLog
from database import Database
import asyncio
import json
import tempfile
import os
import shutil


class DeploymentExecutor:
    """Executes orchestration designs server-side"""
    
    def __init__(self, db: Database, model: str = "claude-sonnet-4-20250514", cwd: Optional[str] = None):
        self.db = db
        self.model = model
        self.cwd = cwd
        self.orchestrator = None
        self.temp_dirs = []  # Track temp directories for cleanup
    
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
            # Ensure orchestration credentials are available
            await ensure_orchestration_credentials()
            
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
            
            execution_order = self._topological_sort(blocks, connections)
            
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
                
                # Update log with incremental progress
                await self.db.update_execution_log(log_id, {
                    "result_data": {
                        "success": True,
                        "results": context["results"],
                        "in_progress": True
                    }
                })
            
            # Execution complete
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            final_result = {
                "success": True,
                "results": context["results"],
                "duration_ms": duration_ms,
                "in_progress": False
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
                "results": context.get("results", {}),  # Include partial results
                "duration_ms": duration_ms,
                "in_progress": False
            }
            
            await self.db.update_execution_log(log_id, {
                "status": "failed",
                "error": str(e),
                "result_data": error_result,
                "completed_at": end_time,
                "duration_ms": duration_ms
            })
            
            raise
        finally:
            # Clean up any temporary directories
            await self._cleanup_temp_dirs()
    
    def _topological_sort(self, blocks: List[Dict], connections: List[Dict]) -> List[str]:
        """
        Sort blocks in execution order using topological sort
        
        Returns list of block IDs in execution order
        """
        # Build adjacency list
        graph: Dict[str, List[str]] = {block["id"]: [] for block in blocks}
        in_degree: Dict[str, int] = {block["id"]: 0 for block in blocks}
        
        for i, conn in enumerate(connections):
            if isinstance(conn, str):
                raise ValueError(f"Connection {i} is a string, not a dictionary")
            
            # Handle both formats: {'source': 'block-1'} and {'source': {'blockId': 'block-1'}}
            source = conn["source"]
            target = conn["target"]
            source_id = source["blockId"] if isinstance(source, dict) else source
            target_id = target["blockId"] if isinstance(target, dict) else target
            
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
        # Handle both formats: {'target': 'block-1'} and {'target': {'blockId': 'block-1'}}
        def get_target_id(conn):
            target = conn["target"]
            return target["blockId"] if isinstance(target, dict) else target
        
        incoming = [c for c in connections if get_target_id(c) == block_id]
        
        if not incoming:
            # Convert dict to JSON string for consistency
            input_data = context["input"]
            if isinstance(input_data, dict):
                return json.dumps(input_data, indent=2) if input_data else ""
            return str(input_data) if input_data else ""
        
        # Format results from previous blocks
        inputs = []
        for conn in incoming:
            source = conn["source"]
            source_id = source["blockId"] if isinstance(source, dict) else source
            if source_id in context["block_outputs"]:
                result = context["block_outputs"][source_id]
                if isinstance(result, dict):
                    # Format nicely
                    inputs.append(json.dumps(result, indent=2))
                else:
                    inputs.append(str(result))
        
        if not inputs:
            input_data = context["input"]
            if isinstance(input_data, dict):
                return json.dumps(input_data, indent=2) if input_data else ""
            return str(input_data) if input_data else ""
        
        return "\n\n---\n\n".join(inputs)
    
    async def _execute_sequential(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute sequential pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        # Build task with input
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents to orchestrator
        agent_names = []
        for agent in agents:
            orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            agent_names.append(agent["name"])
        
        # Execute
        result = await orchestrator.sequential_pipeline(full_task, agent_names)
        return result
    
    async def _execute_parallel(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute parallel pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents
        agent_names = []
        for i, agent in enumerate(agents):
            if not isinstance(agent, dict):
                raise ValueError(f"Agent {i} is not a dictionary")
            
            orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            agent_names.append(agent["name"])
        
        # Execute
        result = await orchestrator.parallel_aggregate(full_task, agent_names)
        return result
    
    async def _execute_hierarchical(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute hierarchical pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # First agent is manager, rest are workers
        manager = agents[0]
        workers = agents[1:]
        
        orchestrator.add_agent(
            name=manager["name"],
            system_prompt=manager["system_prompt"],
            role=AgentRole.MANAGER
        )
        
        worker_names = []
        for worker in workers:
            orchestrator.add_agent(
                name=worker["name"],
                system_prompt=worker["system_prompt"],
                role=AgentRole.WORKER
            )
            worker_names.append(worker["name"])
        
        # Execute
        result = await orchestrator.hierarchical_execution(
            full_task,
            manager["name"],
            worker_names
        )
        return result
    
    async def _execute_debate(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute debate pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        rounds = block["data"].get("rounds", 3)
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # Add agents
        debater_names = []
        for agent in agents:
            orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=self._map_role(agent["role"])
            )
            debater_names.append(agent["name"])
        
        # Execute
        result = await orchestrator.debate(
            full_task,
            debater_names,
            rounds=rounds
        )
        return result
    
    async def _execute_routing(self, block: Dict, block_input: Any, log_id: str) -> Dict[str, Any]:
        """Execute routing pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        full_task = f"{task}\n\nInput: {block_input}" if block_input else task
        
        # First agent is router, rest are specialists
        router = agents[0]
        specialists = agents[1:]
        
        orchestrator.add_agent(
            name=router["name"],
            system_prompt=router["system_prompt"],
            role=AgentRole.MODERATOR
        )
        
        specialist_names = []
        for specialist in specialists:
            orchestrator.add_agent(
                name=specialist["name"],
                system_prompt=specialist["system_prompt"],
                role=AgentRole.SPECIALIST
            )
            specialist_names.append(specialist["name"])
        
        # Execute
        result = await orchestrator.dynamic_routing(
            full_task,
            router["name"],
            specialist_names
        )
        return result
    
    async def _execute_reflection(self, block: Dict, block_input: Any, log_id: str, context: Dict) -> Dict[str, Any]:
        """Execute reflection pattern"""
        agents = block["data"]["agents"]
        task = block["data"]["task"]
        
        # Prepare working directory (clone git repo if assigned)
        block_cwd = await self._prepare_block_working_dir(block)
        
        # Create orchestrator with block-specific working directory
        if block_cwd:
            orchestrator = MultiAgentOrchestrator(model=self.model, cwd=block_cwd)
        else:
            orchestrator = self.orchestrator
        
        # Build context for reflection
        design_context = json.dumps(context.get("results", {}), indent=2)
        full_task = f"{task}\n\nDesign Context:\n{design_context}\n\nInput: {block_input}" if block_input else f"{task}\n\nDesign Context:\n{design_context}"
        
        # Add reflection agent
        for agent in agents:
            orchestrator.add_agent(
                name=agent["name"],
                system_prompt=agent["system_prompt"],
                role=AgentRole.SPECIALIST
            )
        
        # Execute as sequential (reflection agents analyze and provide feedback)
        agent_names = [a["name"] for a in agents]
        result = await orchestrator.sequential_pipeline(full_task, agent_names)
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
    
    async def _clone_git_repo(self, git_repo: str) -> str:
        """
        Clone a git repository to a temporary directory
        
        Args:
            git_repo: Git repository URL to clone
            
        Returns:
            Path to the cloned repository
        """
        temp_dir = tempfile.mkdtemp(prefix="orchestration_block_")
        self.temp_dirs.append(temp_dir)
        
        print(f"📁 Cloning git repo for block: {git_repo}")
        print(f"   Temporary directory: {temp_dir}")
        
        try:
            # Get git environment with SSH support
            from main import get_git_env
            env = get_git_env()
            
            # Clone repository asynchronously
            process = await asyncio.create_subprocess_exec(
                "git", "clone", "--depth", "1", git_repo, temp_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise Exception(f"Failed to clone repository: {error_msg}")
            
            print(f"✅ Git repo cloned successfully to {temp_dir}")
            return temp_dir
            
        except Exception as e:
            print(f"❌ Error cloning git repo: {e}")
            # Remove the temp dir from tracking if clone failed
            if temp_dir in self.temp_dirs:
                self.temp_dirs.remove(temp_dir)
            # Try to clean up the failed clone
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise
    
    async def _prepare_block_working_dir(self, block: Dict) -> Optional[str]:
        """
        Prepare working directory for a block
        
        If block has git_repo assigned, clone it to a temp directory
        Otherwise, return None to use default cwd
        
        Args:
            block: Block configuration
            
        Returns:
            Path to working directory or None
        """
        git_repo = block.get("data", {}).get("git_repo")
        
        if git_repo:
            print(f"📦 Block '{block['data']['label']}' has git repo assigned: {git_repo}")
            return await self._clone_git_repo(git_repo)
        
        return None
    
    async def _cleanup_temp_dirs(self):
        """Clean up all temporary directories created during execution"""
        for temp_dir in self.temp_dirs:
            try:
                if os.path.exists(temp_dir):
                    print(f"🧹 Cleaning up temporary directory: {temp_dir}")
                    shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not clean up {temp_dir}: {e}")
        
        self.temp_dirs.clear()

