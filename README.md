# ActionMesh Web Application

A production-ready web application that uses Meta's [ActionMesh](https://github.com/facebookresearch/actionmesh) model to convert short videos (16–31 frames) into animated 3D meshes with textures and materials.

## 🎬 Overview

This monorepo contains:

- **`frontend/`** - A Next.js app for uploading videos and downloading results
- **`worker/`** - A FastAPI backend that wraps ActionMesh and runs on GPU workers

## 🚀 Quick Start

### Prerequisites

- **Frontend**: Node.js 18+ and npm/yarn/pnpm
- **Worker**: Python 3.10+, NVIDIA GPU with 12-32GB VRAM, CUDA 12.1+

### Running the Frontend Locally

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local to set NEXT_PUBLIC_WORKER_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running the Worker Locally (GPU Required)

```bash
cd worker

# Clone ActionMesh as a submodule
git submodule update --init --recursive
# OR manually clone:
# git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install ActionMesh
cd actionmesh_repo
pip install -r requirements.txt
pip install -e .
cd ..

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

## 📖 End-to-End Flow

1. **User Upload**: User uploads an MP4 video (16-31 frames) via the web UI
2. **Job Creation**: Frontend sends video to worker's `POST /jobs` endpoint
3. **Processing**: Worker extracts frames, runs ActionMesh model on GPU
4. **Results**: Worker returns URLs to:
   - `animated_mesh.glb` (if Blender export enabled)
   - Per-frame meshes (`mesh_000.glb`, `mesh_001.glb`, ...)
   - Preview `.mp4` video (if PyTorch3D available)
5. **Download**: User downloads results from the web UI

## 🎯 Processing Modes

| Mode | GPU VRAM | Time (H100) | Quality |
|------|----------|-------------|---------|
| Default | 32GB+ | ~115s | Highest |
| Fast | 16GB+ | ~45s | High |
| Fast + Low RAM | 12GB+ | ~60s | High |

## 📝 Input Requirements

- **Video length**: 16-31 frames (longer videos will be trimmed)
- **Format**: MP4 or folder of PNG images
- **Best results**: Pre-mask subjects using SAM2 on simple backgrounds
- **Auto-masking**: RMBG model automatically removes backgrounds, but may have limited performance on complex scenes

## 🏗️ Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## 📦 Deployment

- **Frontend**: Deploy to Vercel, Netlify, or any static host
- **Worker**: Deploy to RunPod, Modal, or any GPU service with Docker support

See [worker/deploy.md](worker/deploy.md) for GPU worker deployment instructions.

## 📄 License

This project wraps Meta's ActionMesh which is released under its own license. See the [ActionMesh repository](https://github.com/facebookresearch/actionmesh) for license details.
