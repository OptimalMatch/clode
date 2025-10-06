"""
Deployment Scheduler - Schedules automatic executions of deployed designs
Uses APScheduler for cron and interval-based scheduling
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
from typing import Optional
from database import Database
from deployment_executor import DeploymentExecutor
from models import ExecutionLog
import os


class DeploymentScheduler:
    """Manages scheduled executions of deployed designs"""
    
    def __init__(self, db: Database):
        self.db = db
        self.scheduler = AsyncIOScheduler()
        self.running = False
    
    async def start(self):
        """Start the scheduler and load all scheduled deployments"""
        if self.running:
            print("⚠️ Scheduler already running")
            return
        
        print("🕐 Starting deployment scheduler...")
        
        # Load all active deployments with schedules
        await self.load_scheduled_deployments()
        
        # Start the scheduler
        self.scheduler.start()
        self.running = True
        
        print("✅ Deployment scheduler started")
    
    async def stop(self):
        """Stop the scheduler"""
        if not self.running:
            return
        
        print("🛑 Stopping deployment scheduler...")
        self.scheduler.shutdown()
        self.running = False
        print("✅ Deployment scheduler stopped")
    
    async def load_scheduled_deployments(self):
        """Load all active deployments with enabled schedules"""
        try:
            deployments = await self.db.get_deployments()
            
            for deployment in deployments:
                if (deployment.status == "active" and 
                    deployment.schedule and 
                    deployment.schedule.enabled):
                    await self.schedule_deployment(deployment.id)
                    print(f"📅 Scheduled deployment: {deployment.design_name} ({deployment.id})")
        
        except Exception as e:
            print(f"❌ Error loading scheduled deployments: {e}")
    
    async def schedule_deployment(self, deployment_id: str):
        """Add or update a deployment in the scheduler"""
        try:
            deployment = await self.db.get_deployment(deployment_id)
            if not deployment or not deployment.schedule:
                return
            
            # Remove existing job if any
            try:
                self.scheduler.remove_job(deployment_id)
            except:
                pass  # Job doesn't exist, that's fine
            
            if deployment.status != "active" or not deployment.schedule.enabled:
                print(f"⏸️ Skipping inactive or disabled deployment: {deployment.design_name}")
                return
            
            # Create trigger based on schedule config
            trigger = None
            
            if deployment.schedule.cron_expression:
                # Use cron expression
                try:
                    trigger = CronTrigger.from_crontab(
                        deployment.schedule.cron_expression,
                        timezone=deployment.schedule.timezone
                    )
                    print(f"⏰ Cron schedule for {deployment.design_name}: {deployment.schedule.cron_expression}")
                except Exception as e:
                    print(f"❌ Invalid cron expression for {deployment.design_name}: {e}")
                    return
            
            elif deployment.schedule.interval_seconds:
                # Use interval
                trigger = IntervalTrigger(
                    seconds=deployment.schedule.interval_seconds,
                    timezone=deployment.schedule.timezone
                )
                print(f"⏰ Interval schedule for {deployment.design_name}: every {deployment.schedule.interval_seconds}s")
            
            if trigger:
                self.scheduler.add_job(
                    self.execute_scheduled_deployment,
                    trigger=trigger,
                    id=deployment_id,
                    args=[deployment_id],
                    replace_existing=True
                )
                print(f"✅ Scheduled job added: {deployment.design_name}")
        
        except Exception as e:
            print(f"❌ Error scheduling deployment {deployment_id}: {e}")
    
    async def unschedule_deployment(self, deployment_id: str):
        """Remove a deployment from the scheduler"""
        try:
            self.scheduler.remove_job(deployment_id)
            print(f"🗑️ Unscheduled deployment: {deployment_id}")
        except Exception as e:
            # Job might not exist, that's okay
            pass
    
    async def execute_scheduled_deployment(self, deployment_id: str):
        """Execute a deployment (called by scheduler)"""
        print(f"\n🔔 Scheduled execution triggered for deployment: {deployment_id}")
        
        try:
            # Get deployment
            deployment = await self.db.get_deployment(deployment_id)
            if not deployment:
                print(f"❌ Deployment not found: {deployment_id}")
                return
            
            if deployment.status != "active":
                print(f"⏸️ Deployment is not active: {deployment.design_name}")
                return
            
            # Get design
            design = await self.db.get_orchestration_design(deployment.design_id)
            if not design:
                print(f"❌ Design not found for deployment: {deployment.design_name}")
                return
            
            # Create execution log
            log = ExecutionLog(
                deployment_id=deployment_id,
                design_id=deployment.design_id,
                execution_id=f"scheduled-{datetime.utcnow().timestamp()}",
                status="running",
                trigger_type="scheduled",
                input_data=None,
                started_at=datetime.utcnow()
            )
            created_log = await self.db.create_execution_log(log)
            
            print(f"🚀 Executing scheduled design: {deployment.design_name}")
            
            # Execute design
            model = await self.db.get_default_model() or "claude-sonnet-4-20250514"
            cwd = os.getenv("PROJECT_ROOT_DIR")
            executor = DeploymentExecutor(db=self.db, model=model, cwd=cwd)
            
            result = await executor.execute_design(design, None, created_log.id)
            
            # Update deployment stats
            await self.db.update_deployment(deployment_id, {
                "last_execution_at": datetime.utcnow(),
                "execution_count": deployment.execution_count + 1
            })
            
            print(f"✅ Scheduled execution completed: {deployment.design_name}")
            print(f"   Duration: {result.get('duration_ms', 0)}ms")
        
        except Exception as e:
            print(f"❌ Scheduled execution failed for {deployment_id}: {e}")
            # Error is already logged in ExecutionLog by executor
    
    def get_next_run_time(self, deployment_id: str) -> Optional[datetime]:
        """Get the next scheduled run time for a deployment"""
        try:
            job = self.scheduler.get_job(deployment_id)
            if job:
                return job.next_run_time
        except:
            pass
        return None
    
    def is_scheduled(self, deployment_id: str) -> bool:
        """Check if a deployment is currently scheduled"""
        try:
            job = self.scheduler.get_job(deployment_id)
            return job is not None
        except:
            return False


# Global scheduler instance (initialized in main.py)
deployment_scheduler: Optional[DeploymentScheduler] = None


def get_scheduler() -> Optional[DeploymentScheduler]:
    """Get the global scheduler instance"""
    return deployment_scheduler


def set_scheduler(scheduler: DeploymentScheduler):
    """Set the global scheduler instance"""
    global deployment_scheduler
    deployment_scheduler = scheduler

