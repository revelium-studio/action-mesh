"""
ActionMesh Wrapper

A clean Python API that wraps the ActionMesh model for video-to-mesh conversion.
This module handles frame extraction, ActionMesh invocation, and output management.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
from typing import Optional


# Add ActionMesh repo to path if available
ACTIONMESH_REPO = Path(__file__).parent / "actionmesh_repo"
if ACTIONMESH_REPO.exists():
    sys.path.insert(0, str(ACTIONMESH_REPO))


def extract_frames_from_video(
    video_path: str,
    output_dir: str,
    max_frames: int = 31,
    target_fps: Optional[float] = None,
) -> int:
    """
    Extract frames from a video file using ffmpeg.
    
    Args:
        video_path: Path to the input video file (MP4, MOV, etc.)
        output_dir: Directory to save extracted PNG frames
        max_frames: Maximum number of frames to extract (default 31, ActionMesh limit)
        target_fps: Target FPS for extraction. If None, extracts all frames up to max_frames.
    
    Returns:
        Number of frames extracted
    
    Raises:
        RuntimeError: If ffmpeg fails or no frames are extracted
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Build ffmpeg command
    # Output format: 000.png, 001.png, etc. (3-digit padding for ActionMesh compatibility)
    output_pattern = str(output_path / "%03d.png")
    
    cmd = ["ffmpeg", "-y", "-i", video_path]
    
    if target_fps:
        cmd.extend(["-vf", f"fps={target_fps}"])
    
    # Limit frames and output
    cmd.extend([
        "-frames:v", str(max_frames),
        "-start_number", "0",
        output_pattern,
    ])
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg failed: {e.stderr}")
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Please install ffmpeg.")
    
    # Count extracted frames
    frame_files = list(output_path.glob("*.png"))
    frame_count = len(frame_files)
    
    if frame_count == 0:
        raise RuntimeError("No frames extracted from video")
    
    print(f"Extracted {frame_count} frames from {video_path}")
    return frame_count


def validate_frame_count(input_dir: str) -> int:
    """
    Validate that the input directory has the correct number of frames.
    
    Args:
        input_dir: Directory containing PNG frames
    
    Returns:
        Number of frames found
    
    Raises:
        ValueError: If frame count is outside ActionMesh requirements (16-31)
    """
    input_path = Path(input_dir)
    frame_files = sorted(input_path.glob("*.png"))
    frame_count = len(frame_files)
    
    if frame_count < 16:
        raise ValueError(
            f"Too few frames: {frame_count}. ActionMesh requires at least 16 frames."
        )
    
    if frame_count > 31:
        print(f"Warning: {frame_count} frames found. ActionMesh will only use first 31.")
    
    return frame_count


def run_actionmesh(
    input_dir: str,
    output_dir: str,
    fast: bool = True,
    low_ram: bool = True,
    blender_path: Optional[str] = None,
) -> dict:
    """
    Run ActionMesh to generate animated meshes from input frames.
    
    This function wraps the official ActionMesh inference script and provides
    a clean Python API for video-to-mesh conversion.
    
    Args:
        input_dir: Path to directory containing PNG frames (000.png, 001.png, ...)
                   or path to an MP4 video file
        output_dir: Path to directory where outputs will be saved
        fast: Enable fast mode for ~2.5x speedup with slightly reduced quality
              Default: True (suitable for 16GB+ GPUs)
              Set to False for highest quality (requires 32GB+ GPU)
        low_ram: Enable low RAM mode for GPUs with 12GB VRAM
                 Default: True (for wider GPU compatibility)
                 Set to False if you have 16GB+ VRAM for better performance
        blender_path: Optional path to Blender 3.5.1 executable for exporting
                      a single animated_mesh.glb file. If None, only per-frame
                      meshes are generated.
    
    Returns:
        dict with paths to generated outputs:
        {
            "per_frame_meshes": [list of mesh_XXX.glb paths],
            "animated_mesh": path to animated_mesh.glb or None,
            "preview_video": path to preview .mp4 or None,
        }
    
    Raises:
        RuntimeError: If ActionMesh inference fails
        ValueError: If input validation fails
    
    Example:
        >>> outputs = run_actionmesh(
        ...     input_dir="/path/to/frames",
        ...     output_dir="/path/to/output",
        ...     fast=True,
        ...     low_ram=True,
        ... )
        >>> print(outputs["per_frame_meshes"])
        ['/path/to/output/mesh_000.glb', '/path/to/output/mesh_001.glb', ...]
    
    Notes:
        - On first run, ActionMesh automatically downloads required models:
          * ActionMesh weights (~1GB)
          * TripoSG image-to-3D model
          * DINOv2 vision features
          * RMBG background removal
        - Model downloads are cached in HuggingFace cache (HF_HOME env var)
        
        GPU Requirements:
        - Default mode (fast=False, low_ram=False): 32GB+ VRAM
        - Fast mode (fast=True, low_ram=False): 16GB+ VRAM  
        - Fast + Low RAM (fast=True, low_ram=True): 12GB+ VRAM
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Validate input
    if not input_path.exists():
        raise ValueError(f"Input directory does not exist: {input_dir}")
    
    # Check if input is a video file
    if input_path.is_file() and input_path.suffix.lower() in ['.mp4', '.mov', '.avi', '.webm']:
        # Extract frames to a temp directory
        frames_dir = output_path / "extracted_frames"
        extract_frames_from_video(str(input_path), str(frames_dir))
        input_dir = str(frames_dir)
        input_path = Path(input_dir)
    
    # Validate frame count
    validate_frame_count(input_dir)
    
    # Build command for ActionMesh inference script
    inference_script = ACTIONMESH_REPO / "inference" / "video_to_animated_mesh.py"
    
    if not inference_script.exists():
        # Try alternative: maybe ActionMesh is installed as a package
        # Fall back to calling via python -m or direct import
        return _run_actionmesh_direct(
            input_dir, output_dir, fast, low_ram, blender_path
        )
    
    cmd = [
        sys.executable,
        str(inference_script),
        "--input", str(input_path),
        "--output", str(output_path),
    ]
    
    if fast:
        cmd.append("--fast")
    
    if low_ram:
        cmd.append("--low_ram")
    
    if blender_path:
        cmd.extend(["--blender_path", blender_path])
    
    print(f"Running ActionMesh: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "PYTHONPATH": str(ACTIONMESH_REPO)},
        )
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"ActionMesh stderr: {e.stderr}")
        print(f"ActionMesh stdout: {e.stdout}")
        raise RuntimeError(f"ActionMesh inference failed: {e.stderr}")
    
    return _collect_outputs(output_path)


def _run_actionmesh_direct(
    input_dir: str,
    output_dir: str,
    fast: bool,
    low_ram: bool,
    blender_path: Optional[str],
) -> dict:
    """
    Run ActionMesh directly via Python imports when script is not available.
    
    This is a fallback method that imports ActionMesh modules directly.
    Useful when ActionMesh is installed as a package.
    """
    try:
        # Try importing ActionMesh modules
        from actionmesh.inference import run_inference
        
        run_inference(
            input_path=input_dir,
            output_path=output_dir,
            fast=fast,
            low_ram=low_ram,
            blender_path=blender_path,
        )
        
    except ImportError:
        # ActionMesh not installed - provide helpful error
        raise RuntimeError(
            "ActionMesh not found. Please either:\n"
            "1. Clone the repo: git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo\n"
            "2. Install ActionMesh: pip install -e actionmesh_repo/\n"
            "See the worker README for setup instructions."
        )
    
    return _collect_outputs(Path(output_dir))


def _collect_outputs(output_path: Path) -> dict:
    """Collect and return paths to all generated output files."""
    outputs = {
        "per_frame_meshes": [],
        "animated_mesh": None,
        "preview_video": None,
    }
    
    # Find per-frame meshes
    for mesh_file in sorted(output_path.glob("mesh_*.glb")):
        outputs["per_frame_meshes"].append(str(mesh_file))
    
    # Check for animated mesh
    animated_mesh = output_path / "animated_mesh.glb"
    if animated_mesh.exists():
        outputs["animated_mesh"] = str(animated_mesh)
    
    # Check for preview video (ActionMesh may output various names)
    for pattern in ["*.mp4", "render*.mp4", "preview*.mp4"]:
        for video_file in output_path.glob(pattern):
            outputs["preview_video"] = str(video_file)
            break
        if outputs["preview_video"]:
            break
    
    return outputs


def cleanup_job_files(job_dir: str, keep_outputs: bool = True) -> None:
    """
    Clean up temporary files from a job.
    
    Args:
        job_dir: Path to the job directory
        keep_outputs: If True, only delete input files. If False, delete everything.
    """
    job_path = Path(job_dir)
    
    if not job_path.exists():
        return
    
    if keep_outputs:
        # Only delete input directory and temp files
        input_dir = job_path / "input"
        if input_dir.exists():
            shutil.rmtree(input_dir)
        
        # Delete extracted frames if any
        extracted = job_path / "output" / "extracted_frames"
        if extracted.exists():
            shutil.rmtree(extracted)
    else:
        # Delete entire job directory
        shutil.rmtree(job_path)
