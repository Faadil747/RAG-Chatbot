import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Sparkles } from 'lucide-react';
import { DropzoneUploader } from '@/components/upload/DropzoneUploader';
import { UploadPipelineCard } from '@/components/upload/UploadPipelineCard';
import { useUpload } from '@/hooks/useUpload';

export default function CandidateCreation() {
  const { pending, items, isSubmitting, addFiles, removePending, submit, retryItem, removeItem } = useUpload();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Add Candidates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload resumes and our AI will parse, structure, and score each candidate automatically.
        </p>
      </div>

      <DropzoneUploader
        files={pending}
        onAddFiles={addFiles}
        onRemoveFile={removePending}
        onSubmit={submit}
        isSubmitting={isSubmitting}
      />

      <div className="mt-8">
        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold">No candidates uploaded yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Drag resumes into the zone above, or click to browse. Once uploaded, each resume moves through an
                AI pipeline — parsing, extraction, summarization, and embedding — before it's added to your
                candidate list.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> PDF, DOC, DOCX supported
            </div>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Processing pipeline</p>
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <UploadPipelineCard key={item.id} item={item} onRetry={retryItem} onDismiss={removeItem} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
