'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Film, Zap, Cpu, Sparkles, Box } from 'lucide-react';
import { createJob, validateVideoFile, type JobResponse, type ProcessingMode } from '@/lib/api';

interface UploadFormProps {
  onJobCreated: (job: JobResponse) => void;
  onError: (message: string) => void;
}

interface ModeOption {
  id: ProcessingMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  vram: string;
}

const processingModes: ModeOption[] = [
  {
    id: 'default',
    name: 'High Quality',
    description: 'Best quality output, requires 32GB+ VRAM',
    icon: <Sparkles className="w-5 h-5" />,
    vram: '32GB+',
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Balanced speed and quality, requires 16GB+ VRAM',
    icon: <Zap className="w-5 h-5" />,
    vram: '16GB+',
  },
  {
    id: 'fast_low_ram',
    name: 'Fast + Low RAM',
    description: 'Optimized for limited GPU memory',
    icon: <Cpu className="w-5 h-5" />,
    vram: '12GB+',
  },
];

export function UploadForm({ onJobCreated, onError }: UploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMode, setSelectedMode] = useState<ProcessingMode>('fast_low_ram');
  const [blenderExport, setBlenderExport] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      const validation = validateVideoFile(file);
      if (!validation.valid) {
        onError(validation.error!);
        return;
      }
      setSelectedFile(file);
    },
    [onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      onError('Please select a video file');
      return;
    }

    setIsUploading(true);

    try {
      const job = await createJob(selectedFile, selectedMode, blenderExport);
      onJobCreated(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload video';
      onError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* File Upload */}
      <div
        className={`dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'border-[var(--primary)]' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleInputChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Film className="w-8 h-8 text-[var(--primary)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--foreground)]">{selectedFile.name}</p>
              <p className="text-sm text-[var(--muted)]">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Choose different file
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--surface)] flex items-center justify-center mesh-float">
              <Upload className="w-8 h-8 text-[var(--muted)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Drop your video here or click to browse
              </p>
              <p className="text-sm text-[var(--muted)] mt-1">
                MP4, MOV, AVI, or WebM • 16-31 frames • Max 100MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Processing Mode */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-[var(--foreground)]">
          Processing Mode
        </label>
        <div className="grid gap-3">
          {processingModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelectedMode(mode.id)}
              className={`mode-option text-left ${selectedMode === mode.id ? 'selected' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    selectedMode === mode.id
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'bg-[var(--surface)] text-[var(--muted)]'
                  }`}
                >
                  {mode.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--foreground)]">{mode.name}</span>
                    <span className="text-xs text-[var(--muted)] font-mono">{mode.vram}</span>
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-0.5">{mode.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Blender Export Toggle */}
      <div className="card p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent)]/10">
              <Box className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <span className="font-medium text-[var(--foreground)]">Export Animated Mesh</span>
              <p className="text-sm text-[var(--muted)]">
                Single .glb file with embedded animation (requires Blender)
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={blenderExport}
              onChange={(e) => setBlenderExport(e.target.checked)}
              className="sr-only"
            />
            <div
              className={`w-11 h-6 rounded-full transition-colors ${
                blenderExport ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  blenderExport ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </div>
          </div>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!selectedFile || isUploading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isUploading ? (
          <>
            <div className="w-5 h-5 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin" />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            <span>Generate 3D Mesh</span>
          </>
        )}
      </button>

      {/* Info Note */}
      <p className="text-xs text-center text-[var(--muted)]">
        Backgrounds are auto-removed, but for best results use pre-masked subjects.
        <br />
        <a
          href="https://segment-anything.com/demo"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--primary)] hover:underline"
        >
          Use SAM2 for masking →
        </a>
      </p>
    </form>
  );
}
