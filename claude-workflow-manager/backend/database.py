from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
from bson import ObjectId
from models import Workflow, Prompt, ClaudeInstance, InstanceStatus, InstanceLog, Subagent, LogType, LogAnalytics

class Database:
    def __init__(self):
        self.client = None
        self.db = None
        
    async def connect(self):
        try:
            mongodb_url = os.getenv("MONGODB_URL")
            print(f"📊 DATABASE: Connecting to MongoDB at: {mongodb_url}")
            
            self.client = AsyncIOMotorClient(mongodb_url)
            self.db = self.client.claude_workflows
            
            # Test the connection
            await self.client.admin.command('ping')
            print("✅ DATABASE: MongoDB connection successful")
            
            # Create indexes
            await self._create_indexes()
            print("✅ DATABASE: Indexes created successfully")
            
        except Exception as e:
            print(f"❌ DATABASE: Failed to connect to MongoDB: {e}")
            self.client = None
            self.db = None
            raise
    
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
        await self.db.logs.create_index([("content", "text")])
        
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
        try:
            # Convert string ID to ObjectId for MongoDB query
            object_id = ObjectId(workflow_id) if ObjectId.is_valid(workflow_id) else workflow_id
            workflow = await self.db.workflows.find_one({"_id": object_id})
            if workflow:
                workflow["id"] = str(workflow["_id"])
                del workflow["_id"]
            return workflow
        except Exception as e:
            print(f"Error retrieving workflow {workflow_id}: {e}")
            return None
    
    async def delete_workflow(self, workflow_id: str) -> bool:
        """
        Delete a workflow and all associated data (instances, logs, prompts, subagents)
        """
        try:
            # Convert string ID to ObjectId for MongoDB query
            object_id = ObjectId(workflow_id) if ObjectId.is_valid(workflow_id) else workflow_id
            
            # Check if workflow exists
            workflow = await self.db.workflows.find_one({"_id": object_id})
            if not workflow:
                print(f"Workflow {workflow_id} not found")
                return False
            
            # Delete associated instances
            instances_result = await self.db.instances.delete_many({"workflow_id": workflow_id})
            print(f"Deleted {instances_result.deleted_count} instances for workflow {workflow_id}")
            
            # Delete associated logs
            logs_result = await self.db.logs.delete_many({"workflow_id": workflow_id})
            print(f"Deleted {logs_result.deleted_count} logs for workflow {workflow_id}")
            
            # Delete associated prompts
            prompts_result = await self.db.prompts.delete_many({"workflow_id": workflow_id})
            print(f"Deleted {prompts_result.deleted_count} prompts for workflow {workflow_id}")
            
            # Delete associated subagents
            subagents_result = await self.db.subagents.delete_many({"workflow_id": workflow_id})
            print(f"Deleted {subagents_result.deleted_count} subagents for workflow {workflow_id}")
            
            # Finally, delete the workflow itself
            workflow_result = await self.db.workflows.delete_one({"_id": object_id})
            
            if workflow_result.deleted_count == 1:
                print(f"Successfully deleted workflow {workflow_id}")
                return True
            else:
                print(f"Failed to delete workflow {workflow_id}")
                return False
                
        except Exception as e:
            print(f"Error deleting workflow {workflow_id}: {e}")
            return False
    
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
        try:
            prompt_dict = prompt.dict()
            prompt_dict["updated_at"] = datetime.utcnow()
            
            object_id = ObjectId(prompt_id) if ObjectId.is_valid(prompt_id) else prompt_id
            result = await self.db.prompts.update_one(
                {"_id": object_id},
                {"$set": prompt_dict}
            )
            return result.modified_count > 0
        except Exception as e:
            print(f"Error updating prompt {prompt_id}: {e}")
            return False
    
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
    
    async def update_instance_session_id(self, instance_id: str, session_id: str):
        """Store the session ID for an instance"""
        await self.db.instances.update_one(
            {"id": instance_id},
            {"$set": {"session_id": session_id}}
        )
    
    async def get_instance_session_id(self, instance_id: str) -> Optional[str]:
        """Get the session ID for an instance"""
        instance = await self.db.instances.find_one({"id": instance_id}, {"session_id": 1})
        return instance.get("session_id") if instance else None
    
    async def append_terminal_history(self, instance_id: str, content: str, content_type: str = "output"):
        """Append content to instance terminal history"""
        history_entry = {
            "timestamp": datetime.utcnow(),
            "type": content_type,  # "input", "output", "error", "system"
            "content": content
        }
        
        # Add to history array, keeping only last 500 entries
        await self.db.instances.update_one(
            {"id": instance_id},
            {
                "$push": {
                    "terminal_history": {
                        "$each": [history_entry],
                        "$slice": -500  # Keep only last 500 entries
                    }
                }
            }
        )
    
    async def get_terminal_history(self, instance_id: str) -> List[Dict]:
        """Get terminal history for an instance"""
        instance = await self.db.instances.find_one(
            {"id": instance_id}, 
            {"terminal_history": 1}
        )
        return instance.get("terminal_history", []) if instance else []
    
    async def clear_terminal_history(self, instance_id: str):
        """Clear terminal history for an instance"""
        await self.db.instances.update_one(
            {"id": instance_id},
            {"$unset": {"terminal_history": 1}}
        )
    
    async def delete_instance(self, instance_id: str) -> bool:
        """Delete an instance and all its associated logs"""
        try:
            # Delete the instance
            instance_result = await self.db.instances.delete_one({"id": instance_id})
            
            # Delete associated logs
            logs_result = await self.db.logs.delete_many({"instance_id": instance_id})
            
            print(f"🗑️ DATABASE: Deleted instance {instance_id}")
            print(f"📊 DATABASE: Deleted {logs_result.deleted_count} logs for instance {instance_id}")
            
            return instance_result.deleted_count > 0
        except Exception as e:
            print(f"❌ DATABASE: Error deleting instance {instance_id}: {e}")
            return False
    
    async def add_instance_log(self, log: InstanceLog) -> str:
        if self.db is None:
            raise RuntimeError("Database not connected. Please ensure the database connection is established.")
            
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
        try:
            object_id = ObjectId(subagent_id) if ObjectId.is_valid(subagent_id) else subagent_id
            subagent = await self.db.subagents.find_one({"_id": object_id})
            if subagent:
                subagent["id"] = str(subagent["_id"])
                del subagent["_id"]
            return subagent
        except Exception as e:
            print(f"Error retrieving subagent {subagent_id}: {e}")
            return None
    
    async def get_subagent_by_name(self, name: str) -> Optional[Dict]:
        subagent = await self.db.subagents.find_one({"name": name})
        if subagent:
            subagent["id"] = str(subagent["_id"])
            del subagent["_id"]
        return subagent
    
    async def update_subagent(self, subagent_id: str, subagent: Subagent) -> bool:
        try:
            subagent_dict = subagent.dict()
            subagent_dict["updated_at"] = datetime.utcnow()
            
            object_id = ObjectId(subagent_id) if ObjectId.is_valid(subagent_id) else subagent_id
            result = await self.db.subagents.update_one(
                {"_id": object_id},
                {"$set": subagent_dict}
            )
            return result.modified_count > 0
        except Exception as e:
            print(f"Error updating subagent {subagent_id}: {e}")
            return False
    
    async def delete_subagent(self, subagent_id: str) -> bool:
        try:
            object_id = ObjectId(subagent_id) if ObjectId.is_valid(subagent_id) else subagent_id
            result = await self.db.subagents.delete_one({"_id": object_id})
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting subagent {subagent_id}: {e}")
            return False