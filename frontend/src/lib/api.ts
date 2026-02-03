/**
 * ActionMesh API Client
 *
 * Handles communication with the ActionMesh worker API.
 */

// Worker URL from environment variable
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8000';

export type ProcessingMode = 'default' | 'fast' | 'fast_low_ram';
export type JobStatusType = 'queued' | 'running' | 'finished' | 'error';

export interface JobOutputs {
  per_frame_meshes: string[];
  animated_mesh: string | null;
  preview_video: string | null;
}

export interface JobResponse {
  job_id: string;
  status: JobStatusType;
  error?: string | null;
  outputs?: JobOutputs | null;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
}

/**
 * API Error class for handling HTTP errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Check if the worker is healthy and GPU is available
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${WORKER_URL}/health`);

  if (!response.ok) {
    throw new ApiError(
      'Health check failed',
      response.status,
      await response.text()
    );
  }

  return response.json();
}

/**
 * Create a new processing job
 *
 * @param file - Video file to upload
 * @param mode - Processing mode (default, fast, fast_low_ram)
 * @param blenderExport - Whether to export animated_mesh.glb
 * @returns Job response with job_id
 */
export async function createJob(
  file: File,
  mode: ProcessingMode = 'fast_low_ram',
  blenderExport: boolean = false
): Promise<JobResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  formData.append('blender_export', blenderExport.toString());

  const response = await fetch(`${WORKER_URL}/jobs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(
      errorData.detail || 'Failed to create job',
      response.status,
      errorData.detail
    );
  }

  return response.json();
}

/**
 * Get job status and outputs
 *
 * @param jobId - Job ID to check
 * @returns Job response with status and outputs
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${WORKER_URL}/jobs/${jobId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError('Job not found', 404);
    }
    throw new ApiError(
      'Failed to get job status',
      response.status,
      await response.text()
    );
  }

  return response.json();
}

/**
 * Get the full URL for downloading an output file
 *
 * @param path - Relative path from job outputs
 * @returns Full URL for downloading
 */
export function getOutputUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${WORKER_URL}/${cleanPath}`;
}

/**
 * Get the URL for downloading the meshes archive
 *
 * @param jobId - Job ID
 * @returns Full URL for downloading meshes.zip
 */
export function getMeshesArchiveUrl(jobId: string): string {
  return `${WORKER_URL}/outputs/${jobId}/meshes.zip`;
}

/**
 * Poll job status until completion or error
 *
 * @param jobId - Job ID to poll
 * @param onUpdate - Callback for status updates
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 * @param maxAttempts - Maximum polling attempts (default: 300 = 10 minutes)
 * @returns Final job response
 */
export async function pollJobStatus(
  jobId: string,
  onUpdate?: (job: JobResponse) => void,
  intervalMs: number = 2000,
  maxAttempts: number = 300
): Promise<JobResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const job = await getJobStatus(jobId);

    if (onUpdate) {
      onUpdate(job);
    }

    if (job.status === 'finished' || job.status === 'error') {
      return job;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new ApiError('Job polling timeout', 408, 'Job took too long to complete');
}

/**
 * Delete a job and its files
 *
 * @param jobId - Job ID to delete
 */
export async function deleteJob(jobId: string): Promise<void> {
  const response = await fetch(`${WORKER_URL}/jobs/${jobId}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    throw new ApiError(
      'Failed to delete job',
      response.status,
      await response.text()
    );
  }
}

/**
 * Validate video file before upload
 *
 * @param file - File to validate
 * @returns Validation result
 */
export function validateVideoFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload an MP4, MOV, AVI, or WebM video.',
    };
  }

  // Check file size (100MB max)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
    };
  }

  return { valid: true };
}
