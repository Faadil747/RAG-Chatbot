import { useCallback, useRef, useState } from 'react';
import { uploadCandidates, ApiError } from '@/lib/api';
import { uid } from '@/lib/utils';
import { ANIMATED_STAGES, STAGE_STEP_MS, type UploadItem } from '@/components/upload/pipeline';
import type { UploadResultItem } from '@/types';

/**
 * Manages the resume upload pipeline: a queue of pending files, submission to
 * the backend, and a client-side animated stage progression per file that is
 * reconciled with the real API response once it lands (see task spec: the
 * backend responds once per batch, so we simulate a lively step-by-step
 * pipeline and only "finalize" a card once both the animation has reached the
 * last stage AND we have a real result for that file).
 */
export function useUpload() {
  const [pending, setPending] = useState<File[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const finalResults = useRef<Map<string, UploadResultItem>>(new Map());

  const addFiles = useCallback((files: File[]) => {
    setPending((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const next = files.filter((f) => !existingNames.has(`${f.name}_${f.size}`));
      return [...prev, ...next];
    });
  }, []);

  const removePending = useCallback((file: File) => {
    setPending((prev) => prev.filter((f) => f !== file));
  }, []);

  const clearPending = useCallback(() => setPending([]), []);

  function finalizeItem(itemId: string, fileName: string) {
    const result = finalResults.current.get(fileName);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (!result) return it; // response not back yet — keep pulsing on last stage
        if (result.status === 'success') {
          return { ...it, stage: 'done', candidateId: result.candidateId };
        }
        return { ...it, stage: 'error', error: result.error ?? 'Failed to process resume.' };
      })
    );
  }

  function runAnimation(itemId: string, fileName: string, startDelayMs: number) {
    let stageIdx = -1;
    const tick = () => {
      stageIdx += 1;
      if (stageIdx < ANIMATED_STAGES.length) {
        const stage = ANIMATED_STAGES[stageIdx]!;
        setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, stage } : it)));
      } else {
        // Animation reached the end — finalize using whatever result we have (or wait).
        finalizeItem(itemId, fileName);
        const interval = timers.current.get(itemId);
        if (interval) {
          clearInterval(interval);
          timers.current.delete(itemId);
        }
      }
    };

    const timeout = setTimeout(() => {
      const interval = setInterval(tick, STAGE_STEP_MS);
      timers.current.set(itemId, interval);
      tick();
    }, startDelayMs);

    timers.current.set(itemId, timeout as unknown as ReturnType<typeof setInterval>);
  }

  const submit = useCallback(async () => {
    if (pending.length === 0 || isSubmitting) return;
    const filesToUpload = pending;
    setIsSubmitting(true);
    setPending([]);
    finalResults.current.clear();

    const newItems: UploadItem[] = filesToUpload.map((file) => ({
      id: uid('upload'),
      file,
      stage: 'queued',
    }));
    setItems((prev) => [...newItems, ...prev]);

    newItems.forEach((item, idx) => runAnimation(item.id, item.file.name, idx * 220));

    try {
      const res = await uploadCandidates(filesToUpload);
      for (const result of res.results) {
        finalResults.current.set(result.fileName, result);
      }
      // Reconcile any items whose animation already finished waiting on this result.
      setItems((prev) =>
        prev.map((it) => {
          if (it.stage !== 'storing') return it;
          const result = finalResults.current.get(it.file.name);
          if (!result) return it;
          return result.status === 'success'
            ? { ...it, stage: 'done', candidateId: result.candidateId }
            : { ...it, stage: 'error', error: result.error ?? 'Failed to process resume.' };
        })
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Upload failed. Please try again.';
      // Mark every item in this batch as errored — clear their animation timers first.
      for (const item of newItems) {
        const timer = timers.current.get(item.id);
        if (timer) {
          clearInterval(timer);
          clearTimeout(timer);
          timers.current.delete(item.id);
        }
      }
      setItems((prev) =>
        prev.map((it) => (newItems.some((n) => n.id === it.id) ? { ...it, stage: 'error', error: message } : it))
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [pending, isSubmitting]);

  const retryItem = useCallback(async (itemId: string) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    finalResults.current.delete(item.file.name);
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, stage: 'queued', error: undefined } : it)));
    runAnimation(itemId, item.file.name, 0);

    try {
      const res = await uploadCandidates([item.file]);
      const result = res.results[0];
      if (result) finalResults.current.set(result.fileName, result);
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId) return it;
          if (it.stage !== 'storing') return it; // still animating, will reconcile itself
          if (!result) return { ...it, stage: 'error', error: 'No result returned.' };
          return result.status === 'success'
            ? { ...it, stage: 'done', candidateId: result.candidateId }
            : { ...it, stage: 'error', error: result.error ?? 'Failed to process resume.' };
        })
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Upload failed. Please try again.';
      const timer = timers.current.get(itemId);
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
        timers.current.delete(itemId);
      }
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, stage: 'error', error: message } : it)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const removeItem = useCallback((itemId: string) => {
    const timer = timers.current.get(itemId);
    if (timer) {
      clearInterval(timer);
      clearTimeout(timer);
      timers.current.delete(itemId);
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }, []);

  return {
    pending,
    items,
    isSubmitting,
    addFiles,
    removePending,
    clearPending,
    submit,
    retryItem,
    removeItem,
  };
}
