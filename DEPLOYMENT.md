# 🚀 Production Deployment Guide

Complete guide to deploy ActionMesh with Vercel (frontend) + RunPod (GPU worker).

---

## Part 1: Deploy GPU Worker to RunPod

### Step 1: Create a RunPod Account
1. Go to [RunPod.io](https://www.runpod.io/)
2. Sign up and add payment method
3. Navigate to **Pods** section

### Step 2: Deploy GPU Pod

#### Recommended GPU Options:
| GPU | VRAM | Cost/hr | Mode Support |
|-----|------|---------|--------------|
| **RTX A4000** | 16GB | ~$0.29/hr | Fast |
| **RTX A5000** | 24GB | ~$0.39/hr | Fast (recommended) |
| **RTX A6000** | 48GB | ~$0.79/hr | All modes |
| **A100 40GB** | 40GB | ~$1.89/hr | All modes (fastest) |

**Recommendation**: Start with **RTX A5000 (24GB)** for best price/performance ratio.

#### Deploy Steps:

1. **Click "Deploy"** in RunPod dashboard
2. **Select GPU**: Choose RTX A5000 or A6000
3. **Select Template**: 
   - Use "PyTorch 2.4" or "RunPod PyTorch" template
   - OR use custom Docker: `pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime`
4. **Configure Pod**:
   - **Container Disk**: 50GB minimum (for models)
   - **Volume Disk**: 20GB (for persistent cache - optional but recommended)
   - **Expose HTTP Ports**: `8000`
   - **Environment Variables**:
     ```
     PORT=8000
     JOBS_DIR=/workspace/jobs
     HF_HOME=/workspace/cache/huggingface
     ```

5. **Click "Deploy On-Demand"** or "Deploy Spot" (cheaper but can be interrupted)

### Step 3: Setup Worker on RunPod

Once your pod is running:

1. **Click "Connect"** → Choose **"Start Web Terminal"** or **SSH**

2. **In the terminal, run these commands:**

```bash
# Navigate to workspace
cd /workspace

# Install system dependencies
apt-get update && apt-get install -y git git-lfs ffmpeg

# Clone your repository
git clone https://github.com/revelium-studio/action-mesh.git
cd action-mesh/worker

# Clone ActionMesh repository
git clone https://github.com/facebookresearch/actionmesh.git actionmesh_repo
cd actionmesh_repo
git submodule update --init --recursive

# Install ActionMesh dependencies
pip install -r requirements.txt
pip install -e .
cd ..

# Install worker dependencies
pip install -r requirements.txt

# Create directories
mkdir -p /workspace/jobs /workspace/cache/huggingface

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

3. **Keep this terminal running** - The server must stay active

### Step 4: Get Your RunPod Worker URL

1. In RunPod dashboard, find your pod
2. Click **"Connect"** → **"TCP Port Mappings"**
3. Find the mapping for port **8000**
4. Your worker URL will be something like:
   ```
   https://xxxxx-8000.proxy.runpod.net
   ```
5. **Copy this URL** - you'll need it for Vercel

### Step 5: Test Your Worker

```bash
# Test health check (replace with your URL)
curl https://xxxxx-8000.proxy.runpod.net/health

# Expected response:
# {"status":"healthy","gpu_available":true}
```

If you see `"gpu_available":true`, your worker is ready! ✅

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Connect GitHub to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. **Import Git Repository**:
   - Select **GitHub**
   - Find `revelium-studio/action-mesh`
   - Click **Import**

### Step 2: Configure Project Settings

1. **Framework Preset**: Next.js (auto-detected)
2. **Root Directory**: `frontend`
   - ⚠️ **IMPORTANT**: Click "Edit" and set root directory to `frontend`
3. **Build Settings**:
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

### Step 3: Add Environment Variables

Click **"Environment Variables"** and add:

| Name | Value | Description |
|------|-------|-------------|
| `NEXT_PUBLIC_WORKER_URL` | `https://xxxxx-8000.proxy.runpod.net` | Your RunPod worker URL (from Part 1, Step 4) |

**⚠️ Important**: 
- Use the **FULL URL** including `https://`
- Do **NOT** include a trailing slash
- Example: `https://abc123-8000.proxy.runpod.net`

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for build to complete
3. Vercel will provide your frontend URL:
   ```
   https://action-mesh.vercel.app
   ```

### Step 5: Test End-to-End

1. Visit your Vercel URL
2. Upload a test video
3. Wait for processing
4. Download the generated mesh

---

## Part 3: Production Optimizations

### For RunPod Worker:

#### Option A: Keep Pod Running (Expensive)
- Your pod stays active 24/7
- Cost: ~$280/month for RTX A5000
- Best for: High traffic applications

#### Option B: Auto-Start/Stop (Cost-Effective)
RunPod doesn't support auto-scaling, but you can:
1. Stop the pod when not in use (manual)
2. Start it when needed
3. Update the `NEXT_PUBLIC_WORKER_URL` in Vercel each time

#### Option C: Serverless (Advanced)
Use RunPod Serverless for auto-scaling:
1. Convert to serverless endpoint
2. API changes required
3. Lower cost for sporadic usage

### For Vercel Frontend:

#### Enable CORS (if needed)
The worker already has CORS configured to allow all origins. In production:
1. Edit `worker/main.py`
2. Change `allow_origins=["*"]` to `allow_origins=["https://action-mesh.vercel.app"]`
3. Redeploy worker

#### Custom Domain
1. Go to Vercel project settings
2. Click "Domains"
3. Add your custom domain (e.g., `mesh.yourdomain.com`)

---

## Part 4: Environment Variables Reference

### Vercel (Frontend)
```bash
NEXT_PUBLIC_WORKER_URL=https://xxxxx-8000.proxy.runpod.net
```

### RunPod (Worker)
```bash
PORT=8000
JOBS_DIR=/workspace/jobs
HF_HOME=/workspace/cache/huggingface
BLENDER_PATH=                    # Leave empty unless Blender installed
MAX_UPLOAD_SIZE=104857600        # 100MB
```

---

## Part 5: Monitoring & Troubleshooting

### Check Worker Status

**Health Check:**
```bash
curl https://xxxxx-8000.proxy.runpod.net/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "gpu_available": true
}
```

### Common Issues

#### ❌ "Failed to create job"
- Check worker URL in Vercel environment variables
- Ensure RunPod pod is running
- Test health endpoint directly

#### ❌ "gpu_available": false
- GPU not detected on RunPod
- Restart the pod
- Check CUDA installation: `nvidia-smi`

#### ❌ "Job timeout"
- Video too complex or GPU too slow
- Switch to faster GPU (A6000/A100)
- Use `fast_low_ram` mode

#### ❌ Models not downloading
- Check internet connection on RunPod
- Ensure HuggingFace Hub is accessible
- Set `HF_HOME` correctly

### Logs

**Worker Logs (RunPod):**
```bash
# In RunPod terminal
tail -f /workspace/action-mesh/worker/logs.txt
```

**Frontend Logs (Vercel):**
- Go to Vercel Dashboard → Project → "Logs"

---

## Part 6: Cost Estimation

### Monthly Costs (assuming RTX A5000 @ $0.39/hr)

| Usage Pattern | Hours/Month | Cost/Month |
|---------------|-------------|------------|
| Always On | 720 | ~$280 |
| Business Hours (8hrs/day) | 240 | ~$94 |
| On-Demand (as needed) | Variable | Pay per use |

**Vercel**: Free tier sufficient for most usage (100GB bandwidth/month)

---

## Quick Reference

### Your Deployment URLs

**Frontend**: `https://action-mesh.vercel.app` (or your custom domain)  
**Worker**: `https://xxxxx-8000.proxy.runpod.net` (from RunPod)  
**GitHub**: `https://github.com/revelium-studio/action-mesh`

### Quick Commands

**Start Worker (RunPod):**
```bash
cd /workspace/action-mesh/worker
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Update Worker Code:**
```bash
cd /workspace/action-mesh
git pull origin main
cd worker
# Restart uvicorn
```

**Redeploy Frontend:**
- Push to GitHub → Vercel auto-deploys
- Or manually trigger in Vercel dashboard

---

## 🎉 You're Done!

Your ActionMesh application is now live:
- Frontend: https://action-mesh.vercel.app
- Worker: Running on RunPod with GPU acceleration
- Ready to convert videos to 3D meshes!

For questions or issues, check the troubleshooting section above.
