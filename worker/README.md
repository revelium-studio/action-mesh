# ActionMesh Worker

A FastAPI backend that wraps Meta's [ActionMesh](https://github.com/facebookresearch/actionmesh) model for video-to-mesh conversion.

## Features

- **Video Upload**: Accept MP4 uploads or video URLs
- **Processing Modes**: Support for default, fast, and fast+low_ram modes
- **Output Formats**: Per-frame meshes, animated mesh (with Blender), preview video (with PyTorch3D)
- **Job Management**: Queue jobs and poll for status
- **GPU Optimized**: Designed for 12-32GB VRAM GPUs

## Quick Start

### Prerequisites

- Python 3.10+
- NVIDIA GPU with 12GB+ VRAM
- CUDA 12.1
- ffmpeg

### Setup

```bash
# 1. Clone ActionMesh repository
git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo
cd actionmesh_repo
git submodule update --init --recursive
pip install -r requirements.txt
pip install -e .
cd ..

# 2. Install worker dependencies
pip install -r requirements.txt

# 3. Start the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### With Docker

```bash
# Build
docker build -t actionmesh-worker .

# Run (requires nvidia-docker)
docker run --gpus all -p 8000:8000 \
  -v $(pwd)/cache:/app/cache \
  -v $(pwd)/jobs:/app/jobs \
  actionmesh-worker
```

## API Reference

### `GET /health`

Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "gpu_available": true
}
```

### `POST /jobs`

Create a new processing job.

**Request** (multipart form):
- `file`: Video file (MP4, MOV, AVI, WebM)
- `mode`: Processing mode - `default`, `fast`, `fast_low_ram`
- `blender_export`: Boolean - whether to export animated_mesh.glb

**Or** (JSON with URL):
- `video_url`: URL to download video from
- `mode`: Processing mode
- `blender_export`: Boolean

**Response**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

### `GET /jobs/{job_id}`

Get job status and outputs.

**Response** (when finished):
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "finished",
  "outputs": {
    "per_frame_meshes": [
      "/outputs/550e8400.../mesh_000.glb",
      "/outputs/550e8400.../mesh_001.glb"
    ],
    "animated_mesh": "/outputs/550e8400.../animated_mesh.glb",
    "preview_video": "/outputs/550e8400.../preview.mp4"
  }
}
```

### `GET /outputs/{job_id}/{filename}`

Download an output file.

### `GET /outputs/{job_id}/meshes.zip`

Download all per-frame meshes as a ZIP archive.

### `DELETE /jobs/{job_id}`

Delete a job and its files.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `JOBS_DIR` | Directory for job files | `/tmp/actionmesh_jobs` |
| `HF_HOME` | HuggingFace cache | `~/.cache/huggingface` |
| `BLENDER_PATH` | Path to Blender 3.5.1 | Empty (disabled) |
| `MAX_UPLOAD_SIZE` | Max upload size (bytes) | `104857600` (100MB) |

## Processing Modes

| Mode | VRAM | Time (H100) | Quality |
|------|------|-------------|---------|
| `default` | 32GB+ | ~115s | Highest |
| `fast` | 16GB+ | ~45s | High |
| `fast_low_ram` | 12GB+ | ~60s | High |

## Model Downloads

On first run, these models are automatically downloaded:

- **ActionMesh** from [facebook/ActionMesh](https://huggingface.co/facebook/ActionMesh)
- **TripoSG** from [VAST-AI/TripoSG](https://huggingface.co/VAST-AI/TripoSG)
- **DINOv2** from [facebook/dinov2-large](https://huggingface.co/facebook/dinov2-large)
- **RMBG** from [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4)

Set `HF_HOME` to a persistent location to cache models across restarts.

## Deployment

See [deploy.md](deploy.md) for detailed deployment instructions for RunPod, Modal, and manual server setups.

## Project Structure

```
worker/
├── main.py                 # FastAPI application
├── actionmesh_wrapper.py   # ActionMesh integration
├── job_store.py            # Job state management
├── requirements.txt        # Python dependencies
├── Dockerfile              # GPU container image
├── deploy.md               # Deployment guide
└── actionmesh_repo/        # ActionMesh submodule (after setup)
```
