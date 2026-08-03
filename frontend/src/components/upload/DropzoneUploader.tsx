import { useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { motion } from 'framer-motion';
import { File as FileIcon, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

interface DropzoneUploaderProps {
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DropzoneUploader({ files, onAddFiles, onRemoveFile, onSubmit, isSubmitting }: DropzoneUploaderProps) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted.length > 0) onAddFiles(accepted);
      if (rejections.length > 0) {
        console.warn('Some files were rejected:', rejections.map((r) => r.file.name));
      }
    },
    [onAddFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-secondary/40 hover:bg-secondary/70'
        )}
      >
        <input {...getInputProps()} />
        <motion.div
          animate={isDragActive ? { scale: 1.08 } : { scale: 1 }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <UploadCloud className="h-7 w-7" />
        </motion.div>
        <div>
          <p className="text-sm font-semibold">
            {isDragActive ? 'Drop resumes to upload' : 'Drag & drop resumes, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Supports PDF, DOC, DOCX — multiple files at once</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {files.length} file{files.length > 1 ? 's' : ''} ready to upload
          </p>
          <div className="space-y-1.5">
            {files.map((file) => (
              <motion.div
                key={`${file.name}_${file.size}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <button
                  onClick={() => onRemoveFile(file)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={isSubmitting}>
              <UploadCloud className="h-4 w-4" />
              Upload {files.length} Resume{files.length > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
