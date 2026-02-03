import { NextRequest, NextResponse } from 'next/server';

/**
 * Get job status from RunPod Serverless
 */

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const RUNPOD_BASE_URL = 'https://api.runpod.ai/v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    return NextResponse.json(
      { error: 'RunPod configuration missing' },
      { status: 500 }
    );
  }

  const { jobId } = await params;

  try {
    const response = await fetch(
      `${RUNPOD_BASE_URL}/${RUNPOD_ENDPOINT_ID}/status/${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to get job status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Map RunPod status to our status format
    let status: 'queued' | 'running' | 'finished' | 'error' = 'queued';
    let outputs = null;
    let error = null;

    switch (data.status) {
      case 'IN_QUEUE':
        status = 'queued';
        break;
      case 'IN_PROGRESS':
        status = 'running';
        break;
      case 'COMPLETED':
        status = 'finished';
        outputs = data.output;
        break;
      case 'FAILED':
      case 'CANCELLED':
      case 'TIMED_OUT':
        status = 'error';
        error = data.error || `Job ${data.status.toLowerCase()}`;
        break;
    }

    return NextResponse.json({
      job_id: jobId,
      status,
      outputs,
      error,
    });

  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
