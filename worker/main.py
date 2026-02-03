"""
ActionMesh Worker API

A FastAPI application that exposes ActionMesh video-to-mesh conversion
as an HTTP API suitable for deployment on GPU services.
"""

import os
import uuid
import shutil
import asyncio
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from enum import Enum

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

from job_store import JobStore, JobStatus, Job
from actionmesh_wrapper import run_actionmesh, extract_frames_from_video, validate_frame_count


# Configuration from environment
JOBS_DIR = Path(os.getenv("JOBS_DIR", "/tmp/actionmesh_jobs"))
BLENDER_PATH = os.getenv("BLENDER_PATH")  # Optional: path to Blender executable
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 100 * 1024 * 1024))  # 100MB default

# Global job store
job_store = JobStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup: ensure jobs directory exists
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"ActionMesh Worker started. Jobs directory: {JOBS_DIR}")
    print(f"Blender path: {BLENDER_PATH or 'Not configured (animated_mesh.glb export disabled)'}")
    yield
    # Shutdown: cleanup could go here
    print("ActionMesh Worker shutting down")


app = FastAPI(
    title="ActionMesh Worker API",
    description="Convert videos to animated 3D meshes using Meta's ActionMesh model",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend access
# TODO: In production, restrict origins to your frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProcessingMode(str, Enum):
    DEFAULT = "default"
    FAST = "fast"
    FAST_LOW_RAM = "fast_low_ram"


class JobCreateRequest(BaseModel):
    """Request body for creating a job with video URL."""
    mode: ProcessingMode = ProcessingMode.FAST_LOW_RAM
    blender_export: bool = False
    video_url: Optional[HttpUrl] = None


class JobResponse(BaseModel):
    """Response for job status queries."""
    job_id: str
    status: JobStatus
    error: Optional[str] = None
    outputs: Optional[dict] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    gpu_available: bool


def get_mode_flags(mode: ProcessingMode) -> tuple[bool, bool]:
    """Convert processing mode to fast/low_ram flags."""
    if mode == ProcessingMode.DEFAULT:
        # High quality mode - requires 32GB+ GPU
        # TODO: Change to (False, False) if you have a 32GB GPU
        return False, False
    elif mode == ProcessingMode.FAST:
        # Fast mode - requires 16GB+ GPU
        return True, False
    else:  # FAST_LOW_RAM
        # Fast + Low RAM - works on 12GB GPUs (default for wider compatibility)
        return True, True


async def process_job(job_id: str, mode: ProcessingMode, blender_export: bool):
    """Background task to process a job."""
    job = job_store.get(job_id)
    if not job:
        return
    
    job_dir = JOBS_DIR / job_id
    input_dir = job_dir / "input"
    output_dir = job_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Update status to running
        job_store.update(job_id, status=JobStatus.RUNNING)
        
        # Validate frame count
        frame_files = list(input_dir.glob("*.png"))
        if not frame_files:
            raise ValueError("No frames found in input directory")
        
        frame_count = len(frame_files)
        if frame_count < 16:
            raise ValueError(f"Video too short: {frame_count} frames. ActionMesh requires at least 16 frames.")
        if frame_count > 31:
            # ActionMesh will ignore extra frames, but log a warning
            print(f"Warning: {frame_count} frames provided, only first 31 will be used")
        
        # Get processing flags
        fast, low_ram = get_mode_flags(mode)
        
        # Determine blender path
        blender_path = BLENDER_PATH if blender_export else None
        
        # Run ActionMesh
        await asyncio.to_thread(
            run_actionmesh,
            input_dir=str(input_dir),
            output_dir=str(output_dir),
            fast=fast,
            low_ram=low_ram,
            blender_path=blender_path,
        )
        
        # Collect output files
        outputs = {
            "per_frame_meshes": [],
            "animated_mesh": None,
            "preview_video": None,
        }
        
        # Find per-frame meshes
        for mesh_file in sorted(output_dir.glob("mesh_*.glb")):
            outputs["per_frame_meshes"].append(f"/outputs/{job_id}/{mesh_file.name}")
        
        # Check for animated mesh
        animated_mesh = output_dir / "animated_mesh.glb"
        if animated_mesh.exists():
            outputs["animated_mesh"] = f"/outputs/{job_id}/animated_mesh.glb"
        
        # Check for preview video
        for video_ext in ["*.mp4", "*.MP4"]:
            for video_file in output_dir.glob(video_ext):
                outputs["preview_video"] = f"/outputs/{job_id}/{video_file.name}"
                break
        
        # Update job as finished
        job_store.update(job_id, status=JobStatus.FINISHED, outputs=outputs)
        
    except Exception as e:
        print(f"Job {job_id} failed: {e}")
        job_store.update(job_id, status=JobStatus.ERROR, error=str(e))


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the worker is healthy and GPU is available."""
    gpu_available = False
    try:
        import torch
        gpu_available = torch.cuda.is_available()
    except ImportError:
        pass
    
    return HealthResponse(
        status="healthy",
        gpu_available=gpu_available,
    )


@app.post("/jobs", response_model=JobResponse)
async def create_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    mode: ProcessingMode = Form(ProcessingMode.FAST_LOW_RAM),
    blender_export: bool = Form(False),
    video_url: Optional[str] = Form(None),
):
    """
    Create a new ActionMesh processing job.
    
    Upload a video file directly or provide a video_url.
    The video should contain 16-31 frames for best results.
    """
    # Validate input
    if not file and not video_url:
        raise HTTPException(
            status_code=400,
            detail="Either file upload or video_url is required"
        )
    
    # Generate job ID and create directories
    job_id = str(uuid.uuid4())
    job_dir = JOBS_DIR / job_id
    input_dir = job_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        if file:
            # Handle file upload
            if not file.filename or not file.filename.lower().endswith(('.mp4', '.mov', '.avi', '.webm')):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file type. Please upload an MP4, MOV, AVI, or WebM video."
                )
            
            # Save uploaded file
            video_path = job_dir / "input_video.mp4"
            with open(video_path, "wb") as f:
                content = await file.read()
                if len(content) > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB"
                    )
                f.write(content)
            
            # Extract frames
            frame_count = extract_frames_from_video(str(video_path), str(input_dir))
            
        elif video_url:
            # Download video from URL
            import httpx
            
            video_path = job_dir / "input_video.mp4"
            async with httpx.AsyncClient() as client:
                response = await client.get(video_url, follow_redirects=True)
                response.raise_for_status()
                
                content = response.content
                if len(content) > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB"
                    )
                
                with open(video_path, "wb") as f:
                    f.write(content)
            
            # Extract frames
            frame_count = extract_frames_from_video(str(video_path), str(input_dir))
        
        # Validate frame count
        if frame_count < 16:
            shutil.rmtree(job_dir)
            raise HTTPException(
                status_code=400,
                detail=f"Video too short: {frame_count} frames extracted. ActionMesh requires at least 16 frames."
            )
        
        # Create job record
        job = job_store.create(job_id)
        
        # Start background processing
        background_tasks.add_task(process_job, job_id, mode, blender_export)
        
        return JobResponse(
            job_id=job_id,
            status=JobStatus.QUEUED,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        # Cleanup on error
        if job_dir.exists():
            shutil.rmtree(job_dir)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """Get the status of a processing job."""
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        error=job.error,
        outputs=job.outputs,
    )


@app.get("/outputs/{job_id}/{filename}")
async def download_output(job_id: str, filename: str):
    """Download an output file from a completed job."""
    # Validate job exists and is finished
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=400, detail="Job not finished")
    
    # Validate filename to prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = JOBS_DIR / job_id / "output" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    media_type = "application/octet-stream"
    if filename.endswith(".glb"):
        media_type = "model/gltf-binary"
    elif filename.endswith(".mp4"):
        media_type = "video/mp4"
    elif filename.endswith(".zip"):
        media_type = "application/zip"
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
    )


@app.get("/outputs/{job_id}/meshes.zip")
async def download_meshes_archive(job_id: str):
    """Download all per-frame meshes as a ZIP archive."""
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=400, detail="Job not finished")
    
    output_dir = JOBS_DIR / job_id / "output"
    zip_path = JOBS_DIR / job_id / "meshes.zip"
    
    # Create zip if it doesn't exist
    if not zip_path.exists():
        import zipfile
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for mesh_file in sorted(output_dir.glob("mesh_*.glb")):
                zipf.write(mesh_file, mesh_file.name)
    
    return FileResponse(
        path=zip_path,
        filename=f"meshes_{job_id[:8]}.zip",
        media_type="application/zip",
    )


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its associated files."""
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Don't delete running jobs
    if job.status == JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete running job")
    
    # Remove files
    job_dir = JOBS_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    
    # Remove from store
    job_store.delete(job_id)
    
    return {"status": "deleted", "job_id": job_id}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
