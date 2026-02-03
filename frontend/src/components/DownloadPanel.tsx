'use client';

import { Box, Film, Archive, Download, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';
import { getOutputUrl, getMeshesArchiveUrl, type JobResponse } from '@/lib/api';

interface DownloadPanelProps {
  job: JobResponse;
  onReset: () => void;
}

export function DownloadPanel({ job, onReset }: DownloadPanelProps) {
  const outputs = job.outputs!;

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="success-box text-center">
        <div className="flex items-center justify-center gap-2 text-[var(--success)]">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">Mesh Generation Complete!</span>
        </div>
        <p className="text-sm text-[var(--foreground)] mt-1">
          Your animated 3D mesh is ready for download
        </p>
      </div>

      {/* Preview Video */}
      {outputs.preview_video && (
        <div className="card overflow-hidden">
          <div className="aspect-video bg-black relative">
            <video
              src={getOutputUrl(outputs.preview_video)}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[var(--muted)]" />
                <span className="text-sm text-[var(--foreground)]">Preview Video</span>
              </div>
              <button
                onClick={() =>
                  handleDownload(
                    getOutputUrl(outputs.preview_video!),
                    `actionmesh_preview_${job.job_id.slice(0, 8)}.mp4`
                  )
                }
                className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Buttons */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[var(--foreground)]">Download Files</h3>

        {/* Animated Mesh (Primary) */}
        {outputs.animated_mesh && (
          <a
            href={getOutputUrl(outputs.animated_mesh)}
            download={`animated_mesh_${job.job_id.slice(0, 8)}.glb`}
            className="download-btn w-full group"
          >
            <div className="p-3 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] group-hover:bg-[var(--primary)]/20 transition-colors">
              <Box className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--foreground)]">Animated Mesh</span>
                <span className="file-badge">.glb</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Single file with embedded animation for Blender
              </p>
            </div>
            <Download className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--primary)] transition-colors" />
          </a>
        )}

        {/* Per-Frame Meshes Archive */}
        {outputs.per_frame_meshes && outputs.per_frame_meshes.length > 0 && (
          <a
            href={getMeshesArchiveUrl(job.job_id)}
            download={`meshes_${job.job_id.slice(0, 8)}.zip`}
            className="download-btn w-full group"
          >
            <div className="p-3 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] group-hover:bg-[var(--accent)]/20 transition-colors">
              <Archive className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--foreground)]">Per-Frame Meshes</span>
                <span className="file-badge">.zip</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {outputs.per_frame_meshes.length} individual mesh files
              </p>
            </div>
            <Download className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors" />
          </a>
        )}

        {/* Preview Video Download */}
        {outputs.preview_video && (
          <a
            href={getOutputUrl(outputs.preview_video)}
            download={`preview_${job.job_id.slice(0, 8)}.mp4`}
            className="download-btn w-full group"
          >
            <div className="p-3 rounded-xl bg-[var(--success)]/10 text-[var(--success)] group-hover:bg-[var(--success)]/20 transition-colors">
              <Film className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--foreground)]">Preview Video</span>
                <span className="file-badge">.mp4</span>
              </div>
              <p className="text-sm text-[var(--muted)]">Rendered preview of the animated mesh</p>
            </div>
            <Download className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--success)] transition-colors" />
          </a>
        )}
      </div>

      {/* Mesh Info */}
      <div className="card p-4 space-y-3">
        <h4 className="text-sm font-medium text-[var(--foreground)]">Output Details</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[var(--muted)]">Frame Meshes</span>
            <p className="font-mono text-[var(--foreground)]">
              {outputs.per_frame_meshes?.length || 0}
            </p>
          </div>
          <div>
            <span className="text-[var(--muted)]">Animated Mesh</span>
            <p className="font-mono text-[var(--foreground)]">
              {outputs.animated_mesh ? 'Yes' : 'No'}
            </p>
          </div>
          <div>
            <span className="text-[var(--muted)]">Preview Video</span>
            <p className="font-mono text-[var(--foreground)]">
              {outputs.preview_video ? 'Yes' : 'No'}
            </p>
          </div>
          <div>
            <span className="text-[var(--muted)]">Job ID</span>
            <p className="font-mono text-[var(--foreground)] truncate">{job.job_id.slice(0, 12)}</p>
          </div>
        </div>
      </div>

      {/* Usage Tips */}
      <div className="card p-4 bg-[var(--surface)]/50">
        <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">Usage Tips</h4>
        <ul className="text-sm text-[var(--muted)] space-y-1">
          <li>
            • Import <code className="text-[var(--primary)]">animated_mesh.glb</code> directly into
            Blender 3.5+
          </li>
          <li>• Per-frame meshes can be used in Unity, Unreal, or any 3D software</li>
          <li>• The mesh topology remains consistent across all frames</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Convert Another Video
        </button>
        <a
          href="https://github.com/facebookresearch/actionmesh"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary px-4 flex items-center justify-center"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
