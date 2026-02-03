'use client';

import { useState } from 'react';
import { UploadForm } from '@/components/UploadForm';
import { JobStatus } from '@/components/JobStatus';
import { DownloadPanel } from '@/components/DownloadPanel';
import { Box, Sparkles, Github } from 'lucide-react';
import type { JobResponse, ProcessingMode } from '@/lib/api';

export default function Home() {
  const [currentJob, setCurrentJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleJobCreated = (job: JobResponse) => {
    setCurrentJob(job);
    setError(null);
  };

  const handleJobUpdate = (job: JobResponse) => {
    setCurrentJob(job);
  };

  const handleError = (message: string) => {
    setError(message);
    setCurrentJob(null);
  };

  const handleReset = () => {
    setCurrentJob(null);
    setError(null);
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[var(--foreground)]">ActionMesh</h1>
              <p className="text-xs text-[var(--muted)]">Video → 3D Mesh</p>
            </div>
          </div>
          <a
            href="https://github.com/facebookresearch/actionmesh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">View on GitHub</span>
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Powered by Meta AI
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-[var(--foreground)] to-[var(--muted)] bg-clip-text text-transparent">
            Transform Videos into
            <br />Animated 3D Meshes
          </h2>
          <p className="text-lg text-[var(--muted)] max-w-xl mx-auto">
            Upload a short video (16-31 frames) and get production-ready animated meshes
            in under a minute. Export to Blender, Unity, or any 3D software.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="px-6 pb-16">
        <div className="max-w-2xl mx-auto">
          {/* Error Display */}
          {error && (
            <div className="error-box mb-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[var(--danger)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <div>
                  <p className="font-medium text-[var(--danger)]">Error</p>
                  <p className="text-sm text-[var(--foreground)] mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Try again →
              </button>
            </div>
          )}

          {/* Conditional Content */}
          {!currentJob && !error && (
            <UploadForm onJobCreated={handleJobCreated} onError={handleError} />
          )}

          {currentJob && currentJob.status !== 'finished' && currentJob.status !== 'error' && (
            <JobStatus job={currentJob} onJobUpdate={handleJobUpdate} onError={handleError} />
          )}

          {currentJob && currentJob.status === 'finished' && currentJob.outputs && (
            <DownloadPanel job={currentJob} onReset={handleReset} />
          )}

          {currentJob && currentJob.status === 'error' && (
            <div className="error-box">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[var(--danger)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <div>
                  <p className="font-medium text-[var(--danger)]">Processing Failed</p>
                  <p className="text-sm text-[var(--foreground)] mt-1">
                    {currentJob.error || 'An unknown error occurred during processing.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Try again →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Info Section */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
                <span className="text-xl">🎬</span>
              </div>
              <h3 className="font-semibold mb-2">16-31 Frames</h3>
              <p className="text-sm text-[var(--muted)]">
                Upload videos with 16-31 frames. Longer videos will be automatically trimmed.
              </p>
            </div>
            <div className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mb-4">
                <span className="text-xl">⚡</span>
              </div>
              <h3 className="font-semibold mb-2">Fast Processing</h3>
              <p className="text-sm text-[var(--muted)]">
                Generate animated meshes in under 60 seconds with GPU acceleration.
              </p>
            </div>
            <div className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center mb-4">
                <span className="text-xl">📦</span>
              </div>
              <h3 className="font-semibold mb-2">GLB Export</h3>
              <p className="text-sm text-[var(--muted)]">
                Export as .glb files compatible with Blender, Unity, Unreal, and more.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--muted)]">
          <p>
            Built with{' '}
            <a
              href="https://github.com/facebookresearch/actionmesh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              ActionMesh
            </a>{' '}
            by Meta AI
          </p>
          <p>
            For best results, use pre-masked subjects on simple backgrounds
          </p>
        </div>
      </footer>
    </main>
  );
}
