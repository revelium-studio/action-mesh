# Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Next.js Frontend                              │   │
│  │  • Upload MP4 video                                               │   │
│  │  • Select processing mode                                         │   │
│  │  • Poll job status                                                │   │
│  │  • Download results                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GPU WORKER (RunPod/Modal)                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     FastAPI Application                           │   │
│  │  • POST /jobs - Create processing job                            │   │
│  │  • GET /jobs/{id} - Check job status                             │   │
│  │  • GET /outputs/{filename} - Download results                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   ActionMesh Wrapper                              │   │
│  │  • Frame extraction (ffmpeg)                                      │   │
│  │  • ActionMesh inference                                           │   │
│  │  • Optional Blender export                                        │   │
│  │  • Optional PyTorch3D video render                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     ActionMesh Model                              │   │
│  │  • TripoSG (image-to-3D)                                         │   │
│  │  • DINOv2 (vision features)                                       │   │
│  │  • RMBG (background removal)                                      │   │
│  │  • Temporal 3D Diffusion                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Job Creation
```
User uploads MP4 → Frontend → POST /jobs → Worker
                                              │
                                              ▼
                              Store video to temp folder
                              Create job record (status: queued)
                              Return job_id
```

### 2. Processing
```
Background worker picks up job
        │
        ▼
Extract frames from MP4 (ffmpeg)
Validate frame count (16-31)
        │
        ▼
Run ActionMesh inference
        │
        ▼
Generate outputs:
  • Per-frame meshes (mesh_000.glb, ...)
  • animated_mesh.glb (if Blender available)
  • preview.mp4 (if PyTorch3D available)
        │
        ▼
Update job status: finished
```

### 3. Result Retrieval
```
Frontend polls GET /jobs/{id}
        │
        ▼
When status == finished
        │
        ▼
Display download links
User downloads .glb and .mp4 files
```

## Processing Modes

### Default Mode
- **GPU Requirement**: 32GB+ VRAM (e.g., A100, H100)
- **Quality**: Highest fidelity mesh generation
- **Time**: ~115 seconds on H100
- **Use case**: Production-quality outputs

```python
run_actionmesh(input_dir, output_dir, fast=False, low_ram=False)
```

### Fast Mode
- **GPU Requirement**: 16GB+ VRAM (e.g., A10, RTX 4090)
- **Quality**: Slightly reduced quality
- **Time**: ~45 seconds on H100
- **Use case**: Quick previews, iteration

```python
run_actionmesh(input_dir, output_dir, fast=True, low_ram=False)
```

### Fast + Low RAM Mode
- **GPU Requirement**: 12GB+ VRAM (e.g., T4, RTX 3080)
- **Quality**: Same as Fast mode
- **Time**: ~60 seconds (includes model offloading)
- **Use case**: Limited GPU resources, Google Colab

```python
run_actionmesh(input_dir, output_dir, fast=True, low_ram=True)
```

## Optional Features

### Blender Export
When `blender_path` is provided, ActionMesh exports a single `animated_mesh.glb` file that can be directly imported into Blender with embedded animation.

**Requirements**:
- Blender 3.5.1 installed on the worker
- Path to Blender executable provided

### PyTorch3D Video Rendering
When PyTorch3D is installed, ActionMesh generates a preview `.mp4` video showing the animated mesh rotating.

**Installation**:
```bash
pip install pytorch3d  # Follow official installation guide
```

## Job Store

The current implementation uses an in-memory job store with filesystem-based outputs:

```
/tmp/actionmesh_jobs/
├── {job_id}/
│   ├── input/
│   │   ├── 000.png
│   │   ├── 001.png
│   │   └── ...
│   └── output/
│       ├── mesh_000.glb
│       ├── mesh_001.glb
│       ├── animated_mesh.glb
│       └── preview.mp4
```

### Future Improvements (TODO)
- **Persistent Database**: Replace in-memory store with Redis or PostgreSQL
- **Object Storage**: Store outputs in S3/GCS instead of local filesystem
- **Job Queue**: Use Celery or similar for robust job processing
- **Authentication**: Add API key authentication
- **Rate Limiting**: Prevent abuse with request rate limits

## Environment Variables

### Worker
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8000 |
| `JOBS_DIR` | Directory for job files | `/tmp/actionmesh_jobs` |
| `BLENDER_PATH` | Path to Blender executable | None (disabled) |
| `HF_HOME` | Hugging Face cache directory | `~/.cache/huggingface` |
| `MAX_CONCURRENT_JOBS` | Max parallel jobs | 1 |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_WORKER_URL` | Worker API base URL | None (required) |

## Security Considerations

1. **Input Validation**: Strictly validate uploaded files (type, size, frame count)
2. **File Cleanup**: Automatically delete job files after configurable TTL
3. **CORS**: Configure appropriate CORS headers for frontend origin
4. **Rate Limiting**: Implement request rate limiting per IP/API key
5. **File Size Limits**: Enforce maximum upload size (default: 100MB)
