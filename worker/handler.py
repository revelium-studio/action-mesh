"""
RunPod Serverless Handler for ActionMesh

Uses RunPod's PyTorch template and installs ActionMesh on first cold start.
Models are cached in /runpod-volume for faster subsequent runs.
"""

import os
import sys
import base64
import tempfile
import shutil
import subprocess
import json
from pathlib import Path

import runpod

# Paths
ACTIONMESH_PATH = "/runpod-volume/actionmesh"
CACHE_PATH = "/runpod-volume/cache"
INSTALL_FLAG = "/runpod-volume/.actionmesh_installed"


def install_actionmesh():
    """Install ActionMesh on first cold start."""
    if os.path.exists(INSTALL_FLAG):
        print("ActionMesh already installed, skipping...")
        # Just add to path
        if ACTIONMESH_PATH not in sys.path:
            sys.path.insert(0, ACTIONMESH_PATH)
        return True
    
    print("Installing ActionMesh (first cold start)...")
    
    # Install ffmpeg
    subprocess.run(["apt-get", "update"], capture_output=True)
    subprocess.run(["apt-get", "install", "-y", "ffmpeg", "git", "git-lfs"], capture_output=True)
    
    # Clone ActionMesh
    os.makedirs(ACTIONMESH_PATH, exist_ok=True)
    
    if not os.path.exists(os.path.join(ACTIONMESH_PATH, "inference")):
        subprocess.run([
            "git", "clone", "--depth", "1",
            "https://github.com/facebookresearch/actionmesh.git",
            ACTIONMESH_PATH
        ], check=True)
        
        # Init submodules
        subprocess.run([
            "git", "-C", ACTIONMESH_PATH,
            "submodule", "update", "--init", "--recursive"
        ], check=True)
    
    # Install dependencies
    req_file = os.path.join(ACTIONMESH_PATH, "requirements.txt")
    subprocess.run([
        sys.executable, "-m", "pip", "install", "-q",
        "-r", req_file
    ], check=True)
    
    # Install ActionMesh package
    subprocess.run([
        sys.executable, "-m", "pip", "install", "-q",
        "-e", ACTIONMESH_PATH
    ], check=True)
    
    # Add to path
    sys.path.insert(0, ACTIONMESH_PATH)
    
    # Create flag file
    Path(INSTALL_FLAG).touch()
    
    print("ActionMesh installation complete!")
    return True


def extract_frames(video_path: str, output_dir: str, max_frames: int = 31) -> int:
    """Extract frames from video using ffmpeg."""
    output_pattern = os.path.join(output_dir, "%03d.png")
    
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-frames:v", str(max_frames),
        "-start_number", "0",
        output_pattern
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")
    
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
    env["HF_HOME"] = CACHE_PATH
    env["TRANSFORMERS_CACHE"] = CACHE_PATH
    
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    
    print(f"STDOUT: {result.stdout}")
    if result.returncode != 0:
        print(f"STDERR: {result.stderr}")
        raise RuntimeError(f"ActionMesh failed: {result.stderr}")
    
    return result.stdout


def file_to_base64_url(file_path: str) -> str:
    """Convert file to base64 data URL."""
    with open(file_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    
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
    RunPod Serverless handler.
    
    Input:
        {
            "video_base64": str,      # Base64-encoded video
            "filename": str,          # Original filename  
            "mode": str,              # "default", "fast", or "fast_low_ram"
            "blender_export": bool    # Export animated mesh (requires Blender)
        }
    
    Output:
        {
            "per_frame_meshes": [base64_url, ...],
            "animated_mesh": base64_url or null,
            "preview_video": base64_url or null
        }
    """
    try:
        # Install ActionMesh if needed
        install_actionmesh()
        
        job_input = job["input"]
        
        # Get input parameters
        video_base64 = job_input.get("video_base64")
        filename = job_input.get("filename", "video.mp4")
        mode = job_input.get("mode", "fast_low_ram")
        
        if not video_base64:
            return {"error": "No video_base64 provided"}
        
        # Determine processing flags
        fast = mode in ["fast", "fast_low_ram"]
        low_ram = mode == "fast_low_ram"
        
        print(f"Processing video: {filename}, mode: {mode}")
        
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
            
            print(f"Saved video: {len(video_data)} bytes")
            
            # Extract frames
            frame_count = extract_frames(video_path, input_dir)
            print(f"Extracted {frame_count} frames")
            
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
            
            # Process per-frame meshes (limit to save bandwidth)
            mesh_files = sorted(Path(output_dir).glob("mesh_*.glb"))
            print(f"Found {len(mesh_files)} mesh files")
            
            for mesh_file in mesh_files[:5]:  # First 5 meshes as preview
                outputs["per_frame_meshes"].append(file_to_base64_url(str(mesh_file)))
            
            # Check for animated mesh
            animated_mesh = Path(output_dir) / "animated_mesh.glb"
            if animated_mesh.exists():
                outputs["animated_mesh"] = file_to_base64_url(str(animated_mesh))
            
            # Check for preview video
            for video_file in Path(output_dir).glob("*.mp4"):
                outputs["preview_video"] = file_to_base64_url(str(video_file))
                break
            
            print("Processing complete!")
            return outputs
            
        finally:
            # Cleanup
            shutil.rmtree(work_dir, ignore_errors=True)
            
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Error: {error_msg}")
        return {"error": str(e)}


# Start the serverless handler
runpod.serverless.start({"handler": handler})
