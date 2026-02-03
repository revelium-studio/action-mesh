/**
 * ActionMesh API Client
 *
 * Handles communication with the API routes that proxy to RunPod Serverless.
 */

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
 * Create a new processing job via RunPod Serverless
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

  const response = await fetch('/api/jobs', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      errorData.error || 'Failed to create job',
      response.status,
      errorData.error
    );
  }

  return response.json();
}

/**
 * Get job status from RunPod Serverless
 *
 * @param jobId - Job ID to check
 * @returns Job response with status and outputs
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const response = await fetch(`/api/jobs/${jobId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError('Job not found', 404);
    }
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      errorData.error || 'Failed to get job status',
      response.status,
      errorData.error
    );
  }

  return response.json();
}

/**
 * Get the full URL for downloading an output file
 * For RunPod Serverless, outputs are typically returned as URLs or base64
 *
 * @param path - URL or path from job outputs
 * @returns Full URL for downloading
 */
export function getOutputUrl(path: string): string {
  // If it's already a full URL, return it
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // Otherwise, it might be a relative path or base64
  return path;
}

/**
 * Get the URL for downloading the meshes archive
 *
 * @param jobId - Job ID
 * @returns Full URL for downloading meshes.zip (from RunPod output)
 */
export function getMeshesArchiveUrl(jobId: string): string {
  // This will be set from the job outputs
  return `/api/jobs/${jobId}/meshes`;
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

  // Check file size (50MB max for serverless)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
    };
  }

  return { valid: true };
}
