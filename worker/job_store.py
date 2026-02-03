"""
Job Store

A simple in-memory job store for tracking ActionMesh processing jobs.
This implementation is suitable for single-instance deployments.

TODO: For production with multiple workers, replace with:
- Redis for distributed job state
- PostgreSQL/MySQL for persistent storage
- Celery or similar for job queue management
"""

import threading
from datetime import datetime
from enum import Enum
from typing import Optional, Dict
from dataclasses import dataclass, field


class JobStatus(str, Enum):
    """Status of an ActionMesh processing job."""
    QUEUED = "queued"
    RUNNING = "running"
    FINISHED = "finished"
    ERROR = "error"


@dataclass
class Job:
    """Represents an ActionMesh processing job."""
    job_id: str
    status: JobStatus = JobStatus.QUEUED
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    error: Optional[str] = None
    outputs: Optional[dict] = None


class JobStore:
    """
    Thread-safe in-memory job store.
    
    This provides a simple way to track jobs for single-instance deployments.
    For production multi-instance deployments, consider using Redis or a database.
    
    Example:
        store = JobStore()
        job = store.create("job-123")
        store.update("job-123", status=JobStatus.RUNNING)
        job = store.get("job-123")
        store.delete("job-123")
    """
    
    def __init__(self):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
    
    def create(self, job_id: str) -> Job:
        """
        Create a new job with the given ID.
        
        Args:
            job_id: Unique identifier for the job
            
        Returns:
            The created Job object
            
        Raises:
            ValueError: If a job with this ID already exists
        """
        with self._lock:
            if job_id in self._jobs:
                raise ValueError(f"Job {job_id} already exists")
            
            job = Job(job_id=job_id)
            self._jobs[job_id] = job
            return job
    
    def get(self, job_id: str) -> Optional[Job]:
        """
        Get a job by ID.
        
        Args:
            job_id: The job identifier
            
        Returns:
            The Job object, or None if not found
        """
        with self._lock:
            return self._jobs.get(job_id)
    
    def update(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        error: Optional[str] = None,
        outputs: Optional[dict] = None,
    ) -> Optional[Job]:
        """
        Update a job's status and/or outputs.
        
        Args:
            job_id: The job identifier
            status: New status (optional)
            error: Error message if job failed (optional)
            outputs: Output file paths when job completes (optional)
            
        Returns:
            The updated Job object, or None if not found
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            
            if status is not None:
                job.status = status
            if error is not None:
                job.error = error
            if outputs is not None:
                job.outputs = outputs
            
            job.updated_at = datetime.utcnow()
            return job
    
    def delete(self, job_id: str) -> bool:
        """
        Delete a job from the store.
        
        Args:
            job_id: The job identifier
            
        Returns:
            True if the job was deleted, False if not found
        """
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                return True
            return False
    
    def list_jobs(
        self,
        status: Optional[JobStatus] = None,
        limit: int = 100,
    ) -> list[Job]:
        """
        List jobs, optionally filtered by status.
        
        Args:
            status: Filter by job status (optional)
            limit: Maximum number of jobs to return
            
        Returns:
            List of Job objects, sorted by creation time (newest first)
        """
        with self._lock:
            jobs = list(self._jobs.values())
            
            if status:
                jobs = [j for j in jobs if j.status == status]
            
            # Sort by creation time, newest first
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            
            return jobs[:limit]
    
    def cleanup_old_jobs(self, max_age_hours: int = 24) -> int:
        """
        Remove jobs older than the specified age.
        
        Args:
            max_age_hours: Maximum age in hours for jobs to keep
            
        Returns:
            Number of jobs removed
        """
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        removed = 0
        
        with self._lock:
            job_ids_to_remove = [
                job_id
                for job_id, job in self._jobs.items()
                if job.created_at < cutoff
            ]
            
            for job_id in job_ids_to_remove:
                del self._jobs[job_id]
                removed += 1
        
        return removed
