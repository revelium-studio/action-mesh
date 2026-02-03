"""
RunPod Serverless Handler for ActionMesh

This handler receives video data, processes it with ActionMesh, and returns the results.
Deploy this to RunPod Serverless for auto-scaling GPU inference.
"""

import os
import sys
import base64
import tempfile
import shutil
import subprocess
from pathlib import Path

import runpod

# Add ActionMesh to path
ACTIONMESH_PATH = "/actionmesh"
if os.path.exists(ACTIONMESH_PATH):
    sys.path.insert(0, ACTIONMESH_PATH)


def extract_frames(video_path: str, output_dir: str, max_frames: int = 31) -> int:
    """Extract frames from video using ffmpeg."""
    output_pattern = os.path.join(output_dir, "%03d.png")
    
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-frames:v", str(max_frames),
        "-start_number", "0",
        output_pattern
    ]
    
    subprocess.run(cmd, capture_output=True, check=True)
    
    frame_count = len(list(Path(output_dir).glob("*.png")))
    return frame_count


def run_actionmesh(input_dir: str, output_dir: str, fast: bool = True, low_ram: bool = True):
    """Run ActionMesh inference."""
    inference_script = os.path.join(ACTIONMESH_PATH, "inference", "video_to_animated_mesh.py")
    
    cmd = [
        sys.executable, inference_script,
        "--input", input_dir,
        "--output", output_dir,
    ]
    
    if fast:
        cmd.append("--fast")
    if low_ram:
        cmd.append("--low_ram")
    
    env = os.environ.copy()
    env["PYTHONPATH"] = ACTIONMESH_PATH
    
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    
    if result.returncode != 0:
        raise RuntimeError(f"ActionMesh failed: {result.stderr}")
    
    return result.stdout


def upload_to_storage(file_path: str) -> str:
    """
    Upload file and return URL.
    For now, returns base64-encoded data.
    In production, upload to S3/GCS and return URL.
    """
    with open(file_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    
    # Determine mime type
    ext = Path(file_path).suffix.lower()
    mime_types = {
        ".glb": "model/gltf-binary",
        ".mp4": "video/mp4",
        ".png": "image/png",
    }
    mime_type = mime_types.get(ext, "application/octet-stream")
    
    return f"data:{mime_type};base64,{data}"


def handler(job):
    """
    RunPod Serverless handler function.
    
    Input:
        job["input"] = {
            "video_base64": str,  # Base64-encoded video
            "filename": str,      # Original filename
            "mode": str,          # "default", "fast", or "fast_low_ram"
            "blender_export": bool
        }
    
    Output:
        {
            "per_frame_meshes": [url, ...],
            "animated_mesh": url or null,
            "preview_video": url or null
        }
    """
    job_input = job["input"]
    
    # Get input parameters
    video_base64 = job_input.get("video_base64")
    filename = job_input.get("filename", "video.mp4")
    mode = job_input.get("mode", "fast_low_ram")
    blender_export = job_input.get("blender_export", False)
    
    if not video_base64:
        return {"error": "No video_base64 provided"}
    
    # Determine processing flags
    fast = mode in ["fast", "fast_low_ram"]
    low_ram = mode == "fast_low_ram"
    
    # Create temp directories
    work_dir = tempfile.mkdtemp(prefix="actionmesh_")
    input_dir = os.path.join(work_dir, "input")
    output_dir = os.path.join(work_dir, "output")
    os.makedirs(input_dir)
    os.makedirs(output_dir)
    
    try:
        # Save video from base64
        video_path = os.path.join(work_dir, filename)
        video_data = base64.b64decode(video_base64)
        with open(video_path, "wb") as f:
            f.write(video_data)
        
        # Extract frames
        frame_count = extract_frames(video_path, input_dir)
        
        if frame_count < 16:
            return {"error": f"Video too short: {frame_count} frames. Need at least 16."}
        
        # Run ActionMesh
        run_actionmesh(input_dir, output_dir, fast=fast, low_ram=low_ram)
        
        # Collect outputs
        outputs = {
            "per_frame_meshes": [],
            "animated_mesh": None,
            "preview_video": None,
        }
        
        # Upload per-frame meshes
        for mesh_file in sorted(Path(output_dir).glob("mesh_*.glb")):
            url = upload_to_storage(str(mesh_file))
            outputs["per_frame_meshes"].append(url)
        
        # Check for animated mesh
        animated_mesh = Path(output_dir) / "animated_mesh.glb"
        if animated_mesh.exists():
            outputs["animated_mesh"] = upload_to_storage(str(animated_mesh))
        
        # Check for preview video
        for video_file in Path(output_dir).glob("*.mp4"):
            outputs["preview_video"] = upload_to_storage(str(video_file))
            break
        
        return outputs
        
    except Exception as e:
        return {"error": str(e)}
    
    finally:
        # Cleanup
        shutil.rmtree(work_dir, ignore_errors=True)


# Start the serverless handler
runpod.serverless.start({"handler": handler})
