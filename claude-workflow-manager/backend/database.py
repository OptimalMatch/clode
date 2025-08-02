from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
from models import Workflow, Prompt, ClaudeInstance, InstanceStatus, InstanceLog, Subagent, LogType, LogAnalytics

class Database:
    def __init__(self):
        self.client = None
        self.db = None
        
    async def connect(self):
        self.client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
        self.db = self.client.claude_workflows
        
        # Create indexes
        await self._create_indexes()
    
    async def disconnect(self):
        if self.client:
            self.client.close()
    
    async def _create_indexes(self):
        # Workflows indexes
        await self.db.workflows.create_index("created_at")
        await self.db.workflows.create_index("name")
        
        # Prompts indexes
        await self.db.prompts.create_index("created_at")
        await self.db.prompts.create_index("tags")
        await self.db.prompts.create_index("name")
        
        # Instances indexes
        await self.db.instances.create_index("workflow_id")
        await self.db.instances.create_index("status")
        await self.db.instances.create_index("created_at")
        
        # Logs indexes
        await self.db.logs.create_index([("instance_id", 1), ("timestamp", -1)])
        await self.db.logs.create_index([("workflow_id", 1), ("timestamp", -1)])
        await self.db.logs.create_index("type")
        await self.db.logs.create_text_index("content")
        
        # Subagents indexes
        await self.db.subagents.create_index("name", unique=True)
        await self.db.subagents.create_index("capabilities")
        await self.db.subagents.create_index("trigger_keywords")
    
    # Workflow methods
    async def create_workflow(self, workflow: Workflow) -> str:
        workflow_dict = workflow.dict()
        workflow_dict["created_at"] = datetime.utcnow()
        workflow_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.workflows.insert_one(workflow_dict)
        return str(result.inserted_id)
    
    async def get_workflows(self) -> List[Dict]:
        cursor = self.db.workflows.find().sort("created_at", -1)
        workflows = []
        async for workflow in cursor:
            workflow["id"] = str(workflow["_id"])
            del workflow["_id"]
            workflows.append(workflow)
        return workflows
    
    async def get_workflow(self, workflow_id: str) -> Optional[Dict]:
        workflow = await self.db.workflows.find_one({"_id": workflow_id})
        if workflow:
            workflow["id"] = str(workflow["_id"])
            del workflow["_id"]
        return workflow
    
    # Prompt methods
    async def create_prompt(self, prompt: Prompt) -> str:
        prompt_dict = prompt.dict()
        prompt_dict["created_at"] = datetime.utcnow()
        prompt_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.prompts.insert_one(prompt_dict)
        return str(result.inserted_id)
    
    async def get_prompts(self) -> List[Dict]:
        cursor = self.db.prompts.find().sort("created_at", -1)
        prompts = []
        async for prompt in cursor:
            prompt["id"] = str(prompt["_id"])
            del prompt["_id"]
            prompts.append(prompt)
        return prompts
    
    async def update_prompt(self, prompt_id: str, prompt: Prompt) -> bool:
        prompt_dict = prompt.dict()
        prompt_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.prompts.update_one(
            {"_id": prompt_id},
            {"$set": prompt_dict}
        )
        return result.modified_count > 0
    
    # Instance methods
    async def create_instance(self, instance: ClaudeInstance) -> str:
        instance_dict = instance.dict()
        result = await self.db.instances.insert_one(instance_dict)
        return str(result.inserted_id)
    
    async def get_instance(self, instance_id: str) -> Optional[ClaudeInstance]:
        instance = await self.db.instances.find_one({"id": instance_id})
        if instance:
            del instance["_id"]
            return ClaudeInstance(**instance)
        return None
    
    async def get_instances_by_workflow(self, workflow_id: str) -> List[Dict]:
        cursor = self.db.instances.find({"workflow_id": workflow_id}).sort("created_at", -1)
        instances = []
        async for instance in cursor:
            del instance["_id"]
            instances.append(instance)
        return instances
    
    async def update_instance_status(self, instance_id: str, status: InstanceStatus, error: str = None):
        update_data = {
            "status": status.value,
            "updated_at": datetime.utcnow()
        }
        
        if status == InstanceStatus.COMPLETED:
            update_data["completed_at"] = datetime.utcnow()
        
        if error:
            update_data["error"] = error
        
        await self.db.instances.update_one(
            {"id": instance_id},
            {"$set": update_data}
        )
    
    async def add_instance_log(self, log: InstanceLog) -> str:
        log_dict = log.dict()
        log_dict["timestamp"] = log_dict.get("timestamp", datetime.utcnow())
        
        result = await self.db.logs.insert_one(log_dict)
        return str(result.inserted_id)
    
    async def get_instance_logs(self, instance_id: str, log_type: Optional[LogType] = None, 
                               limit: int = 100, offset: int = 0) -> List[Dict]:
        query = {"instance_id": instance_id}
        if log_type:
            query["type"] = log_type.value
        
        cursor = self.db.logs.find(query).sort("timestamp", -1).skip(offset).limit(limit)
        logs = []
        async for log in cursor:
            log["id"] = str(log["_id"])
            del log["_id"]
            logs.append(log)
        return logs
    
    async def get_logs_by_workflow(self, workflow_id: str, limit: int = 100) -> List[Dict]:
        cursor = self.db.logs.find({"workflow_id": workflow_id}).sort("timestamp", -1).limit(limit)
        logs = []
        async for log in cursor:
            log["id"] = str(log["_id"])
            del log["_id"]
            logs.append(log)
        return logs
    
    async def search_logs(self, query: str, workflow_id: Optional[str] = None, 
                         instance_id: Optional[str] = None) -> List[Dict]:
        search_query = {"$text": {"$search": query}}
        
        if workflow_id:
            search_query["workflow_id"] = workflow_id
        if instance_id:
            search_query["instance_id"] = instance_id
        
        cursor = self.db.logs.find(search_query).sort("timestamp", -1).limit(100)
        logs = []
        async for log in cursor:
            log["id"] = str(log["_id"])
            del log["_id"]
            logs.append(log)
        return logs
    
    async def get_instance_analytics(self, instance_id: str) -> LogAnalytics:
        # Aggregate logs for analytics
        pipeline = [
            {"$match": {"instance_id": instance_id}},
            {"$group": {
                "_id": None,
                "total_interactions": {"$sum": 1},
                "total_tokens": {"$sum": "$tokens_used"},
                "total_execution_time": {"$sum": "$execution_time_ms"},
                "error_count": {"$sum": {"$cond": [{"$eq": ["$type", "error"]}, 1, 0]}},
                "subagents": {"$addToSet": "$subagent_name"},
                "min_timestamp": {"$min": "$timestamp"},
                "max_timestamp": {"$max": "$timestamp"}
            }}
        ]
        
        result = await self.db.logs.aggregate(pipeline).to_list(1)
        
        if not result:
            return LogAnalytics(
                instance_id=instance_id,
                total_interactions=0,
                total_tokens=0,
                total_execution_time_ms=0,
                error_count=0,
                subagents_used=[],
                interaction_timeline=[],
                average_response_time_ms=0,
                success_rate=0
            )
        
        data = result[0]
        
        # Get timeline
        timeline_cursor = self.db.logs.find({"instance_id": instance_id}).sort("timestamp", 1)
        timeline = []
        async for log in timeline_cursor:
            timeline.append({
                "timestamp": log["timestamp"],
                "type": log["type"],
                "tokens": log.get("tokens_used", 0),
                "execution_time": log.get("execution_time_ms", 0)
            })
        
        total_interactions = data["total_interactions"]
        error_count = data["error_count"]
        
        return LogAnalytics(
            instance_id=instance_id,
            total_interactions=total_interactions,
            total_tokens=data["total_tokens"] or 0,
            total_execution_time_ms=data["total_execution_time"] or 0,
            error_count=error_count,
            subagents_used=[s for s in data["subagents"] if s],
            interaction_timeline=timeline,
            average_response_time_ms=(data["total_execution_time"] or 0) / total_interactions if total_interactions > 0 else 0,
            success_rate=(total_interactions - error_count) / total_interactions if total_interactions > 0 else 0
        )
    
    # Subagent methods
    async def create_subagent(self, subagent: Subagent) -> str:
        subagent_dict = subagent.dict()
        subagent_dict["created_at"] = datetime.utcnow()
        subagent_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.subagents.insert_one(subagent_dict)
        return str(result.inserted_id)
    
    async def get_subagents(self) -> List[Dict]:
        cursor = self.db.subagents.find().sort("created_at", -1)
        subagents = []
        async for subagent in cursor:
            subagent["id"] = str(subagent["_id"])
            del subagent["_id"]
            subagents.append(subagent)
        return subagents
    
    async def get_subagent(self, subagent_id: str) -> Optional[Dict]:
        subagent = await self.db.subagents.find_one({"_id": subagent_id})
        if subagent:
            subagent["id"] = str(subagent["_id"])
            del subagent["_id"]
        return subagent
    
    async def get_subagent_by_name(self, name: str) -> Optional[Dict]:
        subagent = await self.db.subagents.find_one({"name": name})
        if subagent:
            subagent["id"] = str(subagent["_id"])
            del subagent["_id"]
        return subagent
    
    async def update_subagent(self, subagent_id: str, subagent: Subagent) -> bool:
        subagent_dict = subagent.dict()
        subagent_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.subagents.update_one(
            {"_id": subagent_id},
            {"$set": subagent_dict}
        )
        return result.modified_count > 0
    
    async def delete_subagent(self, subagent_id: str) -> bool:
        result = await self.db.subagents.delete_one({"_id": subagent_id})
        return result.deleted_count > 0