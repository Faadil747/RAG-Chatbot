export type PipelineStage =
  | 'queued'
  | 'uploading'
  | 'parsing'
  | 'extracting'
  | 'summarizing'
  | 'embedding'
  | 'storing'
  | 'done'
  | 'error';

export const ANIMATED_STAGES: PipelineStage[] = [
  'uploading',
  'parsing',
  'extracting',
  'summarizing',
  'embedding',
  'storing',
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  parsing: 'Parsing Resume',
  extracting: 'Extracting Information',
  summarizing: 'Generating AI Summary',
  embedding: 'Generating Embeddings',
  storing: 'Storing Candidate',
  done: 'Candidate Added',
  error: 'Failed',
};

export const STAGE_STEP_MS = 850;

export interface UploadItem {
  id: string;
  file: File;
  stage: PipelineStage;
  candidateId?: string;
  error?: string;
}
