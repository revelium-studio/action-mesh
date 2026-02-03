# ActionMesh Worker Deployment Guide

This guide explains how to deploy the ActionMesh worker to GPU services.

## Requirements

### Hardware
- **GPU**: NVIDIA GPU with CUDA support
  - Minimum: 12GB VRAM (T4, RTX 3080) - use `fast + low_ram` mode
  - Recommended: 16GB+ VRAM (A10, RTX 4090) - use `fast` mode
  - Best quality: 32GB+ VRAM (A100, H100) - use `default` mode

### Software
- CUDA 12.1 or compatible
- Python 3.10+
- ffmpeg (for video processing)

### Model Downloads
On first run, ActionMesh automatically downloads models from HuggingFace:

| Model | Size | Source |
|-------|------|--------|
| ActionMesh | ~1GB | [facebook/ActionMesh](https://huggingface.co/facebook/ActionMesh) |
| TripoSG | ~2GB | [VAST-AI/TripoSG](https://huggingface.co/VAST-AI/TripoSG) |
| DINOv2 | ~1GB | [facebook/dinov2-large](https://huggingface.co/facebook/dinov2-large) |
| RMBG | ~200MB | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) |

**Tip**: Mount a persistent volume to `/app/cache` to avoid re-downloading models on each deployment.

---

## Deployment Options

### Option 1: RunPod

1. **Create a new Serverless Endpoint** or **Pod** with GPU:
   - Template: PyTorch 2.4 with CUDA 12.1
   - GPU: A10 (24GB) recommended for fast mode

2. **Using Docker (Serverless)**:
   ```bash
   # Build and push to Docker Hub
   docker build -t yourusername/actionmesh-worker:latest .
   docker push yourusername/actionmesh-worker:latest
   ```

   Then configure RunPod to use your image.

3. **Using RunPod Pod (Interactive)**:
   ```bash
   # SSH into your RunPod
   cd /workspace
   git clone https://github.com/yourusername/action-mesh.git
   cd action-mesh/worker
   
   # Setup
   git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo
   cd actionmesh_repo && pip install -r requirements.txt && pip install -e . && cd ..
   pip install -r requirements.txt
   
   # Run
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. **Environment Variables**:
   ```
   PORT=8000
   JOBS_DIR=/workspace/jobs
   HF_HOME=/workspace/cache/huggingface
   BLENDER_PATH=  # Leave empty or set path to Blender
   ```

### Option 2: Modal

1. **Create a Modal app** (`modal_app.py`):
   ```python
   import modal
   
   app = modal.App("actionmesh-worker")
   
   image = (
       modal.Image.from_registry("pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime")
       .apt_install("git", "git-lfs", "ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
       .run_commands(
           "git clone https://github.com/facebookresearch/actionmesh.git /actionmesh",
           "cd /actionmesh && pip install -r requirements.txt && pip install -e .",
       )
       .pip_install("fastapi", "uvicorn[standard]", "python-multipart", "httpx", "pydantic")
       .copy_local_file("main.py", "/app/main.py")
       .copy_local_file("actionmesh_wrapper.py", "/app/actionmesh_wrapper.py")
       .copy_local_file("job_store.py", "/app/job_store.py")
   )
   
   @app.function(
       image=image,
       gpu="A10G",  # or "T4" for cheaper, "A100" for faster
       timeout=600,
       secrets=[modal.Secret.from_name("hf-token")],  # Optional: for gated models
   )
   @modal.asgi_app()
   def serve():
       from main import app
       return app
   ```

2. **Deploy**:
   ```bash
   modal deploy modal_app.py
   ```

### Option 3: Manual Server (SSH)

For any GPU server (AWS EC2, GCP, your own hardware):

```bash
# 1. Install NVIDIA drivers and CUDA 12.1
# (Follow your provider's documentation)

# 2. Install system dependencies
sudo apt-get update
sudo apt-get install -y git git-lfs ffmpeg python3.10 python3.10-venv

# 3. Clone the project
git clone https://github.com/yourusername/action-mesh.git
cd action-mesh/worker

# 4. Setup Python environment
python3.10 -m venv venv
source venv/bin/activate

# 5. Install ActionMesh
git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo
cd actionmesh_repo
pip install -r requirements.txt
pip install -e .
cd ..

# 6. Install worker dependencies
pip install -r requirements.txt

# 7. Configure environment
export JOBS_DIR=/data/actionmesh_jobs
export HF_HOME=/data/cache/huggingface
export PORT=8000

# 8. Run with screen/tmux for persistence
screen -S actionmesh
uvicorn main:app --host 0.0.0.0 --port 8000

# Detach with Ctrl+A, D
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `JOBS_DIR` | Directory for job files | `/tmp/actionmesh_jobs` |
| `HF_HOME` | HuggingFace cache | `~/.cache/huggingface` |
| `BLENDER_PATH` | Path to Blender 3.5.1 | Empty (disabled) |
| `MAX_UPLOAD_SIZE` | Max upload in bytes | `104857600` (100MB) |

### Installing Optional Features

#### PyTorch3D (Video Rendering)
```bash
# Follow official guide: https://github.com/facebookresearch/pytorch3d/blob/main/INSTALL.md
pip install "git+https://github.com/facebookresearch/pytorch3d.git"
```

#### Blender (Animated Mesh Export)
```bash
# Download Blender 3.5.1
wget https://download.blender.org/release/Blender3.5/blender-3.5.1-linux-x64.tar.xz
tar -xf blender-3.5.1-linux-x64.tar.xz
sudo mv blender-3.5.1-linux-x64 /opt/blender
export BLENDER_PATH=/opt/blender/blender
```

---

## Testing the Deployment

1. **Health Check**:
   ```bash
   curl http://YOUR_SERVER:8000/health
   # Expected: {"status":"healthy","gpu_available":true}
   ```

2. **Submit a Test Job**:
   ```bash
   curl -X POST http://YOUR_SERVER:8000/jobs \
     -F "file=@test_video.mp4" \
     -F "mode=fast_low_ram" \
     -F "blender_export=false"
   # Returns: {"job_id":"...", "status":"queued"}
   ```

3. **Check Job Status**:
   ```bash
   curl http://YOUR_SERVER:8000/jobs/{job_id}
   ```

---

## Production Considerations

### Security
- [ ] Add API key authentication
- [ ] Configure CORS to allow only your frontend domain
- [ ] Enable HTTPS via reverse proxy (nginx, Caddy)
- [ ] Set appropriate file size limits

### Reliability
- [ ] Add persistent job queue (Redis, RabbitMQ)
- [ ] Use database for job storage (PostgreSQL)
- [ ] Implement job retries on failure
- [ ] Add monitoring and alerting

### Scalability
- [ ] Use auto-scaling GPU instances
- [ ] Implement job queuing across workers
- [ ] Add load balancing for multiple workers
- [ ] Store outputs in object storage (S3, GCS)

### Cost Optimization
- [ ] Use spot/preemptible instances when possible
- [ ] Implement job cleanup to free storage
- [ ] Cache HuggingFace models on persistent volume
- [ ] Scale down during low traffic
