# ActionMesh Worker Dockerfile
# 
# This Dockerfile builds a GPU-enabled container for running ActionMesh.
# Suitable for deployment on RunPod, Modal, or any GPU service.
#
# Expected GPU: NVIDIA with 12-32GB VRAM (T4, A10, A100, H100, etc.)
# CUDA Version: 12.1 (matches ActionMesh requirements)
# PyTorch Version: 2.4.0

# Base image with CUDA and PyTorch pre-installed
FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# HuggingFace cache directory - mount a volume here for model persistence
ENV HF_HOME=/app/cache/huggingface
ENV TRANSFORMERS_CACHE=/app/cache/huggingface

# Jobs directory - mount a volume here for persistent job storage
ENV JOBS_DIR=/app/jobs

# Optional: Path to Blender executable for animated mesh export
# Set this if Blender is installed in the container
# ENV BLENDER_PATH=/usr/bin/blender
ENV BLENDER_PATH=""

# Server configuration
ENV PORT=8000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Clone ActionMesh repository
RUN git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo \
    && cd actionmesh_repo \
    && git submodule update --init --recursive

# Install ActionMesh dependencies
RUN pip install --no-cache-dir -r actionmesh_repo/requirements.txt \
    && pip install --no-cache-dir -e actionmesh_repo/

# Copy worker application files
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY actionmesh_wrapper.py .
COPY job_store.py .

# Create directories for cache and jobs
RUN mkdir -p /app/cache/huggingface /app/jobs

# Optional: Install PyTorch3D for video rendering
# Uncomment the following lines if you need video preview generation
# This significantly increases build time and image size
# RUN pip install --no-cache-dir "git+https://github.com/facebookresearch/pytorch3d.git"

# Optional: Install Blender for animated mesh export
# Uncomment the following lines to enable animated_mesh.glb export
# This adds ~500MB to the image
# RUN wget -q https://download.blender.org/release/Blender3.5/blender-3.5.1-linux-x64.tar.xz \
#     && tar -xf blender-3.5.1-linux-x64.tar.xz \
#     && mv blender-3.5.1-linux-x64 /opt/blender \
#     && rm blender-3.5.1-linux-x64.tar.xz \
#     && ln -s /opt/blender/blender /usr/local/bin/blender
# ENV BLENDER_PATH=/usr/local/bin/blender

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


# =============================================================================
# BUILD INSTRUCTIONS
# =============================================================================
#
# Build the image:
#   docker build -t actionmesh-worker .
#
# Run locally (requires NVIDIA GPU and nvidia-docker):
#   docker run --gpus all -p 8000:8000 \
#     -v $(pwd)/cache:/app/cache \
#     -v $(pwd)/jobs:/app/jobs \
#     actionmesh-worker
#
# Run with Blender support:
#   docker run --gpus all -p 8000:8000 \
#     -e BLENDER_PATH=/usr/local/bin/blender \
#     -v $(pwd)/cache:/app/cache \
#     -v $(pwd)/jobs:/app/jobs \
#     actionmesh-worker
#
# =============================================================================
# GPU MEMORY REQUIREMENTS
# =============================================================================
#
# Mode              | VRAM Required | Recommended GPUs
# ------------------|---------------|------------------
# fast + low_ram    | 12GB+         | T4, RTX 3080
# fast              | 16GB+         | A10, RTX 4090  
# default           | 32GB+         | A100, H100
#
# =============================================================================
