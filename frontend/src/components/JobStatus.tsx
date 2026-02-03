'use client';

import { useEffect, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, Cpu } from 'lucide-react';
import { getJobStatus, type JobResponse } from '@/lib/api';

interface JobStatusProps {
  job: JobResponse;
  onJobUpdate: (job: JobResponse) => void;
  onError: (message: string) => void;
}

const statusConfig = {
  queued: {
    icon: Clock,
    color: 'text-[var(--accent)]',
    bgColor: 'bg-[var(--accent)]/10',
    label: 'Queued',
    description: 'Your job is in the queue and will start soon...',
  },
  running: {
    icon: Cpu,
    color: 'text-[var(--primary)]',
    bgColor: 'bg-[var(--primary)]/10',
    label: 'Processing',
    description: 'ActionMesh is generating your 3D mesh...',
  },
  finished: {
    icon: CheckCircle,
    color: 'text-[var(--success)]',
    bgColor: 'bg-[var(--success)]/10',
    label: 'Complete',
    description: 'Your animated mesh is ready!',
  },
  error: {
    icon: XCircle,
    color: 'text-[var(--danger)]',
    bgColor: 'bg-[var(--danger)]/10',
    label: 'Failed',
    description: 'Something went wrong during processing.',
  },
};

export function JobStatus({ job, onJobUpdate, onError }: JobStatusProps) {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start polling if job is queued or running
    if (job.status === 'queued' || job.status === 'running') {
      const poll = async () => {
        try {
          const updatedJob = await getJobStatus(job.job_id);
          onJobUpdate(updatedJob);

          // Continue polling if still in progress
          if (updatedJob.status !== 'finished' && updatedJob.status !== 'error') {
            pollIntervalRef.current = setTimeout(poll, 2000);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to check job status';
          onError(message);
        }
      };

      // Initial delay before first poll
      pollIntervalRef.current = setTimeout(poll, 1000);
    }

    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
      }
    };
  }, [job.job_id, job.status, onJobUpdate, onError]);

  const config = statusConfig[job.status];
  const StatusIcon = config.icon;

  return (
    <div className="card p-8 glow-primary">
      <div className="flex flex-col items-center text-center space-y-6">
        {/* Status Icon */}
        <div className={`p-4 rounded-2xl ${config.bgColor}`}>
          {job.status === 'running' ? (
            <div className="relative">
              <Loader2 className={`w-12 h-12 ${config.color} animate-spin`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-[var(--primary)] animate-pulse" />
              </div>
            </div>
          ) : job.status === 'queued' ? (
            <Clock className={`w-12 h-12 ${config.color} status-pulse`} />
          ) : (
            <StatusIcon className={`w-12 h-12 ${config.color}`} />
          )}
        </div>

        {/* Status Text */}
        <div>
          <h3 className={`text-xl font-semibold ${config.color}`}>{config.label}</h3>
          <p className="text-[var(--muted)] mt-1">{config.description}</p>
        </div>

        {/* Progress Bar */}
        {(job.status === 'queued' || job.status === 'running') && (
          <div className="w-full max-w-xs">
            <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <div className="h-full w-1/4 bg-[var(--primary)] rounded-full progress-indeterminate" />
            </div>
          </div>
        )}

        {/* Job ID */}
        <div className="text-xs text-[var(--muted)] font-mono">
          Job ID: {job.job_id.slice(0, 8)}...
        </div>

        {/* Processing Steps */}
        {job.status === 'running' && (
          <div className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span>Extracting frames</span>
              <CheckCircle className="w-4 h-4 text-[var(--success)]" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--foreground)]">Running ActionMesh</span>
              <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin" />
            </div>
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span>Generating output files</span>
              <div className="w-4 h-4 rounded-full border border-[var(--border)]" />
            </div>
          </div>
        )}

        {/* Time Estimate */}
        {job.status === 'running' && (
          <p className="text-xs text-[var(--muted)]">
            This typically takes 45-120 seconds depending on the processing mode
          </p>
        )}
      </div>
    </div>
  );
}
