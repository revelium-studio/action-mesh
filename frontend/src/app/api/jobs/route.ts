import { NextRequest, NextResponse } from 'next/server';

/**
 * RunPod Serverless API Proxy
 * 
 * This API route proxies requests to RunPod Serverless, keeping the API key secure.
 * Environment variables needed:
 * - RUNPOD_API_KEY: Your RunPod API key
 * - RUNPOD_ENDPOINT_ID: Your RunPod Serverless endpoint ID
 */

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const RUNPOD_BASE_URL = 'https://api.runpod.ai/v2';

export async function POST(request: NextRequest) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    return NextResponse.json(
      { error: 'RunPod configuration missing' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'fast_low_ram';
    const blenderExport = formData.get('blender_export') === 'true';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to base64 for RunPod
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Submit job to RunPod Serverless
    const response = await fetch(`${RUNPOD_BASE_URL}/${RUNPOD_ENDPOINT_ID}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          video_base64: base64,
          filename: file.name,
          mode: mode,
          blender_export: blenderExport,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('RunPod error:', error);
      return NextResponse.json(
        { error: 'Failed to submit job to RunPod' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      job_id: data.id,
      status: 'queued',
    });

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
