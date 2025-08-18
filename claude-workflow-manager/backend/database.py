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
            
            # Add aggregated metrics for each workflow
            workflow_id = workflow.get("id")
            if workflow_id:
                metrics = await self._get_workflow_metrics(workflow_id)
                workflow.update(metrics)
            
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
    
    async def get_instances_by_workflow(self, workflow_id: str, include_archived: bool = False) -> List[Dict]:
        # Build query filter
        query = {"workflow_id": workflow_id}
        if not include_archived:
            query["archived"] = {"$ne": True}  # Only get non-archived instances
            
        cursor = self.db.instances.find(query).sort("created_at", -1)
        instances = []
        async for instance in cursor:
            del instance["_id"]
            
            # Add aggregated metrics for each instance
            instance_id = instance.get("id")
            if instance_id:
                metrics = await self._get_instance_metrics(instance_id)
                instance.update(metrics)
            
            instances.append(instance)
        return instances
    
    async def _get_instance_metrics(self, instance_id: str) -> Dict:
        """Get aggregated metrics (tokens, cost) for an instance"""
        try:
            # Aggregate all logs for this instance
            pipeline = [
                {"$match": {"instance_id": instance_id}},
                {"$group": {
                    "_id": None,
                    "total_tokens": {"$sum": "$tokens_used"},
                    "total_input_tokens": {"$sum": "$token_usage.input_tokens"},
                    "total_output_tokens": {"$sum": "$token_usage.output_tokens"},
                    "total_cache_creation_tokens": {"$sum": "$token_usage.cache_creation_input_tokens"},
                    "total_cache_read_tokens": {"$sum": "$token_usage.cache_read_input_tokens"},
                    "total_cost_usd": {"$sum": "$total_cost_usd"},
                    "total_execution_time_ms": {"$sum": "$execution_time_ms"},
                    "log_count": {"$sum": 1}
                }}
            ]
            
            cursor = self.db.logs.aggregate(pipeline)
            result = await cursor.to_list(length=1)
            
            if not result:
                return {
                    "total_tokens": 0,
                    "total_cost_usd": 0,
                    "total_execution_time_ms": 0,
                    "log_count": 0
                }
            
            data = result[0]
            
            # Calculate detailed token breakdown if available
            total_input = data.get("total_input_tokens", 0) or 0
            total_output = data.get("total_output_tokens", 0) or 0
            total_cache_create = data.get("total_cache_creation_tokens", 0) or 0
            total_cache_read = data.get("total_cache_read_tokens", 0) or 0
            
            # Use detailed breakdown if available, otherwise fall back to total_tokens
            calculated_total = total_input + total_output + total_cache_create + total_cache_read
            final_total_tokens = calculated_total if calculated_total > 0 else (data.get("total_tokens", 0) or 0)
            
            metrics = {
                "total_tokens": final_total_tokens,
                "total_cost_usd": round(data.get("total_cost_usd", 0) or 0, 4),
                "total_execution_time_ms": data.get("total_execution_time_ms", 0) or 0,
                "log_count": data.get("log_count", 0) or 0,
                "token_breakdown": {
                    "input_tokens": total_input,
                    "output_tokens": total_output,
                    "cache_creation_input_tokens": total_cache_create,
                    "cache_read_input_tokens": total_cache_read
                } if calculated_total > 0 else None
            }
            
            return metrics
            
        except Exception as e:
            print(f"Error getting metrics for instance {instance_id}: {e}")
            return {
                "total_tokens": 0,
                "total_cost_usd": 0,
                "total_execution_time_ms": 0,
                "log_count": 0
            }
    
    async def _get_workflow_metrics(self, workflow_id: str) -> Dict:
        """Get aggregated metrics (tokens, cost) for all instances in a workflow"""
        try:
            # Aggregate all logs for all instances in this workflow
            pipeline = [
                {"$match": {"workflow_id": workflow_id}},
                {"$group": {
                    "_id": None,
                    "total_tokens": {"$sum": "$tokens_used"},
                    "total_input_tokens": {"$sum": "$token_usage.input_tokens"},
                    "total_output_tokens": {"$sum": "$token_usage.output_tokens"},
                    "total_cache_creation_tokens": {"$sum": "$token_usage.cache_creation_input_tokens"},
                    "total_cache_read_tokens": {"$sum": "$token_usage.cache_read_input_tokens"},
                    "total_cost_usd": {"$sum": "$total_cost_usd"},
                    "total_execution_time_ms": {"$sum": "$execution_time_ms"},
                    "log_count": {"$sum": 1},
                    "unique_instances": {"$addToSet": "$instance_id"}
                }}
            ]
            
            cursor = self.db.logs.aggregate(pipeline)
            result = await cursor.to_list(length=1)
            
            if not result:
                return {
                    "total_tokens": 0,
                    "total_cost_usd": 0,
                    "total_execution_time_ms": 0,
                    "log_count": 0,
                    "instance_count": 0
                }
            
            data = result[0]
            
            # Calculate detailed token breakdown if available
            total_input = data.get("total_input_tokens", 0) or 0
            total_output = data.get("total_output_tokens", 0) or 0
            total_cache_create = data.get("total_cache_creation_tokens", 0) or 0
            total_cache_read = data.get("total_cache_read_tokens", 0) or 0
            
            # Use detailed breakdown if available, otherwise fall back to total_tokens
            calculated_total = total_input + total_output + total_cache_create + total_cache_read
            final_total_tokens = calculated_total if calculated_total > 0 else (data.get("total_tokens", 0) or 0)
            
            # Count unique instances
            unique_instances = data.get("unique_instances", [])
            instance_count = len(unique_instances) if unique_instances else 0
            
            metrics = {
                "total_tokens": final_total_tokens,
                "total_cost_usd": round(data.get("total_cost_usd", 0) or 0, 4),
                "total_execution_time_ms": data.get("total_execution_time_ms", 0) or 0,
                "log_count": data.get("log_count", 0) or 0,
                "instance_count": instance_count,
                "token_breakdown": {
                    "input_tokens": total_input,
                    "output_tokens": total_output,
                    "cache_creation_input_tokens": total_cache_create,
                    "cache_read_input_tokens": total_cache_read
                } if calculated_total > 0 else None
            }
            
            return metrics
            
        except Exception as e:
            print(f"Error getting workflow metrics for {workflow_id}: {e}")
            return {
                "total_tokens": 0,
                "total_cost_usd": 0,
                "total_execution_time_ms": 0,
                "log_count": 0,
                "instance_count": 0
            }
    
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
    
    async def archive_instance(self, instance_id: str) -> bool:
        """Archive an instance (soft delete)"""
        try:
            result = await self.db.instances.update_one(
                {"id": instance_id},
                {
                    "$set": {
                        "archived": True,
                        "archived_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            if result.modified_count > 0:
                print(f"📦 DATABASE: Archived instance {instance_id}")
            return result.modified_count > 0
        except Exception as e:
            print(f"❌ DATABASE: Error archiving instance {instance_id}: {e}")
            return False
    
    async def unarchive_instance(self, instance_id: str) -> bool:
        """Unarchive an instance"""
        try:
            result = await self.db.instances.update_one(
                {"id": instance_id},
                {
                    "$set": {
                        "archived": False,
                        "updated_at": datetime.utcnow()
                    },
                    "$unset": {"archived_at": 1}
                }
            )
            if result.modified_count > 0:
                print(f"📤 DATABASE: Unarchived instance {instance_id}")
            return result.modified_count > 0
        except Exception as e:
            print(f"❌ DATABASE: Error unarchiving instance {instance_id}: {e}")
            return False
    
    async def delete_instance(self, instance_id: str) -> bool:
        """Permanently delete an instance and all its associated logs (use with caution)"""
        try:
            # Delete the instance
            instance_result = await self.db.instances.delete_one({"id": instance_id})
            
            # Delete associated logs
            logs_result = await self.db.logs.delete_many({"instance_id": instance_id})
            
            print(f"🗑️ DATABASE: Permanently deleted instance {instance_id}")
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
                "max_timestamp": {"$max": "$timestamp"},
                # Sum detailed token breakdown fields
                "total_input_tokens": {"$sum": "$token_usage.input_tokens"},
                "total_output_tokens": {"$sum": "$token_usage.output_tokens"},
                "total_cache_creation_tokens": {"$sum": "$token_usage.cache_creation_input_tokens"},
                "total_cache_read_tokens": {"$sum": "$token_usage.cache_read_input_tokens"},
                "total_cost_usd": {"$sum": "$total_cost_usd"}
            }}
        ]
        
        result = await self.db.logs.aggregate(pipeline).to_list(1)
        
        if not result:
            return LogAnalytics(
                instance_id=instance_id,
                total_interactions=0,
                total_tokens=0,
                token_breakdown=None,
                total_cost_usd=None,
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
        
        # Create token breakdown if we have detailed token data
        token_breakdown = None
        total_input = data.get("total_input_tokens", 0) or 0
        total_output = data.get("total_output_tokens", 0) or 0
        total_cache_create = data.get("total_cache_creation_tokens", 0) or 0
        total_cache_read = data.get("total_cache_read_tokens", 0) or 0
        
        if total_input > 0 or total_output > 0 or total_cache_create > 0 or total_cache_read > 0:
            from models import TokenUsage  # Import here to avoid circular dependency
            token_breakdown = TokenUsage(
                input_tokens=total_input,
                output_tokens=total_output,
                cache_creation_input_tokens=total_cache_create,
                cache_read_input_tokens=total_cache_read,
                total_tokens=total_input + total_output + total_cache_create + total_cache_read
            )
        
        total_cost = data.get("total_cost_usd", 0.0) or 0.0
        
        return LogAnalytics(
            instance_id=instance_id,
            total_interactions=total_interactions,
            total_tokens=data["total_tokens"] or 0,
            token_breakdown=token_breakdown,
            total_cost_usd=total_cost if total_cost > 0 else None,
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

    async def get_last_todos(self, instance_id: str) -> List[Dict]:
        """Get the last TodoWrite tool output for an instance"""
        try:
            print(f"🔍 Searching for todos for instance: {instance_id}")
            
            # Look for tool_use logs with TodoWrite tool
            pipeline = [
                {"$match": {
                    "instance_id": instance_id,
                    "type": "tool_use",
                    "metadata.tool_name": "TodoWrite"
                }},
                {"$sort": {"timestamp": -1}},
                {"$limit": 1}
            ]
            
            print(f"🔍 Using pipeline: {pipeline}")
            
            cursor = self.db.logs.aggregate(pipeline)
            logs = await cursor.to_list(length=1)
            
            print(f"🔍 Found {len(logs)} matching logs")
            
            if not logs:
                # Let's also check what logs exist for this instance
                total_logs = await self.db.logs.count_documents({"instance_id": instance_id})
                print(f"🔍 Total logs for instance {instance_id}: {total_logs}")
                
                # Check for tool_use logs specifically
                tool_use_logs = await self.db.logs.count_documents({
                    "instance_id": instance_id, 
                    "type": "tool_use"
                })
                print(f"🔍 Tool use logs for instance {instance_id}: {tool_use_logs}")
                
                return []
            
            # Extract todos from the tool metadata
            log = logs[0]
            metadata = log.get("metadata", {})
            tool_input = metadata.get("tool_input", {})
            todos = tool_input.get("todos", [])
            
            print(f"🔍 Found {len(todos)} todos in tool metadata")
            
            # Convert to the format expected by frontend
            formatted_todos = []
            for todo in todos:
                if isinstance(todo, dict):
                    formatted_todo = {
                        "id": todo.get("id", "unknown"),
                        "content": todo.get("content", ""),
                        "status": todo.get("status", "pending")
                    }
                    if "priority" in todo:
                        formatted_todo["priority"] = todo["priority"]
                    formatted_todos.append(formatted_todo)
            
            print(f"🔍 Returning {len(formatted_todos)} formatted todos")
            return formatted_todos
            
        except Exception as e:
            print(f"Error retrieving last todos for instance {instance_id}: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _parse_todos_from_content(self, content: str) -> List[Dict]:
        """Parse todos from TodoWrite tool output content"""
        import re
        
        # Strip ANSI escape codes
        clean_content = re.sub(r'\x1b\[[0-9;]*m', '', content)
        
        # Look for TODO messages like: "📋 **Managing TODOs:** 2 items\n  • Task 1 (pending) [medium]\n  • Task 2 (completed)"
        todo_match = re.search(r'📋 \*\*Managing TODOs:\*\* (\d+) items?\n((?:\s*• .+\n?)*)', clean_content)
        
        if not todo_match:
            return []
        
        todo_lines = todo_match.group(2).strip().split('\n')
        todos = []
        
        for index, line in enumerate(todo_lines):
            # Parse line like: "  • Create placeholder files 171.txt to 190.txt in python folder (pending) [medium]"
            match = re.match(r'^\s*• (.+?) \(([^)]+)\)(?:\s*\[([^\]]+)\])?', line)
            if match:
                content_text, status, priority = match.groups()
                todo = {
                    "id": f"todo-{index}",
                    "content": content_text.strip(),
                    "status": status.strip(),
                }
                if priority:
                    todo["priority"] = priority.strip()
                todos.append(todo)
        
        return todos
    
    # Claude Authentication Profile Methods
    async def create_claude_auth_profile(self, profile: 'ClaudeAuthProfile') -> str:
        """Create a new Claude authentication profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        profile_dict = profile.dict()
        profile_dict["created_at"] = profile_dict.get("created_at", datetime.utcnow())
        profile_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.claude_auth_profiles.insert_one(profile_dict)
        return str(result.inserted_id)
    
    async def get_claude_auth_profiles(self) -> List['ClaudeAuthProfile']:
        """Get all active Claude authentication profiles"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        profiles = []
        cursor = self.db.claude_auth_profiles.find({"is_active": True}).sort("last_used_at", -1)
        async for profile in cursor:
            del profile["_id"]
            from models import ClaudeAuthProfile
            profiles.append(ClaudeAuthProfile(**profile))
        return profiles
    
    async def get_claude_auth_profile(self, profile_id: str) -> Optional['ClaudeAuthProfile']:
        """Get a specific Claude authentication profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        profile = await self.db.claude_auth_profiles.find_one({"id": profile_id, "is_active": True})
        if profile:
            del profile["_id"]
            from models import ClaudeAuthProfile
            return ClaudeAuthProfile(**profile)
        return None
    
    async def update_claude_auth_profile(self, profile_id: str, updates: dict) -> bool:
        """Update a Claude authentication profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        updates["updated_at"] = datetime.utcnow()
        result = await self.db.claude_auth_profiles.update_one(
            {"id": profile_id}, 
            {"$set": updates}
        )
        return result.modified_count > 0
    
    async def delete_claude_auth_profile(self, profile_id: str) -> bool:
        """Soft delete a Claude authentication profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        result = await self.db.claude_auth_profiles.update_one(
            {"id": profile_id}, 
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    async def set_profile_last_used(self, profile_id: str) -> bool:
        """Update the last used timestamp for a profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        result = await self.db.claude_auth_profiles.update_one(
            {"id": profile_id}, 
            {"$set": {"last_used_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    async def set_selected_claude_profile(self, profile_id: str, selected_by: Optional[str] = None) -> bool:
        """Set the selected/default Claude profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        # Verify the profile exists and is active
        profile = await self.get_claude_auth_profile(profile_id)
        if not profile or not profile.is_active:
            return False
        
        # Use upsert to ensure only one selected profile per user (or globally if selected_by is None)
        filter_query = {"selected_by": selected_by} if selected_by else {"selected_by": {"$exists": False}}
        
        selection_doc = {
            "selected_profile_id": profile_id,
            "selected_by": selected_by,
            "selected_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await self.db.claude_profile_selections.update_one(
            filter_query,
            {"$set": selection_doc},
            upsert=True
        )
        
        return result.upserted_id is not None or result.modified_count > 0

    async def get_selected_claude_profile(self, selected_by: Optional[str] = None) -> Optional['ClaudeProfileSelection']:
        """Get the selected/default Claude profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        filter_query = {"selected_by": selected_by} if selected_by else {"selected_by": {"$exists": False}}
        
        selection = await self.db.claude_profile_selections.find_one(filter_query)
        if not selection:
            return None
        
        # Remove MongoDB _id field
        if "_id" in selection:
            del selection["_id"]
        
        from models import ClaudeProfileSelection
        return ClaudeProfileSelection(**selection)

    async def get_selected_profile_with_details(self, selected_by: Optional[str] = None) -> Optional[Dict[str, any]]:
        """Get the selected profile with full profile details"""
        selection = await self.get_selected_claude_profile(selected_by)
        if not selection:
            return None
        
        profile = await self.get_claude_auth_profile(selection.selected_profile_id)
        if not profile or not profile.is_active:
            # Selected profile no longer exists or is inactive, clear the selection
            await self.clear_selected_claude_profile(selected_by)
            return None
        
        return {
            "selected_profile_id": selection.selected_profile_id,
            "profile_name": profile.profile_name,
            "user_email": profile.user_email,
            "auth_method": profile.auth_method,
            "selected_at": selection.selected_at,
            "profile": profile
        }

    async def clear_selected_claude_profile(self, selected_by: Optional[str] = None) -> bool:
        """Clear the selected/default Claude profile"""
        if self.db is None:
            raise RuntimeError("Database not connected")
        
        filter_query = {"selected_by": selected_by} if selected_by else {"selected_by": {"$exists": False}}
        
        result = await self.db.claude_profile_selections.delete_one(filter_query)
        return result.deleted_count > 0