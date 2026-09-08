// MediVerify AI - Chat Orchestration SSE Event Contract
// TS mirror of the backend's app/events/event_types.py

export type EventStep =
  | 'queued'
  | 'triage'
  | 'd1_rag'
  | 'd2_memory'
  | 'd4_government_api'
  | 'd4_credential_api'
  | 'd4_hrms'
  | 'd4_ocr'
  | 'd3_compose'
  | 'd3_report'
  | 'awaiting_approval'
  | 'complete'
  | 'error';

export type EventStatus = 'running' | 'done' | 'error';

export interface ProgressEvent {
  step: Exclude<EventStep, 'complete' | 'error' | 'awaiting_approval'>;
  status: EventStatus;
  detail?: string | null;
}

export interface CompleteEvent {
  step: 'complete';
  output: any;
}

export interface ErrorEvent {
  step: 'error';
  status: 'error';
  message: string;
}

export interface AwaitingApprovalEvent {
  step: 'awaiting_approval';
  status: 'done';
  report_id: string;
}

export type ChatStreamEvent = ProgressEvent | CompleteEvent | ErrorEvent | AwaitingApprovalEvent;

const TERMINAL_STEPS = new Set<EventStep>(['complete', 'error', 'awaiting_approval']);

export function isTerminalEvent(evt: { step: string }): boolean {
  return TERMINAL_STEPS.has(evt.step as EventStep);
}

// Friendly copy for the live progress UI. Falls back to `detail` or the raw
// step name for any step not listed here (keeps this forward-compatible with
// steps the backend may start emitting later).
export const STEP_LABELS: Partial<Record<EventStep, string>> = {
  queued: 'Queued for processing',
  triage: 'Reading your question',
  d1_rag: 'Searching policy knowledge base',
  d2_memory: 'Recalling conversation memory',
  d4_government_api: 'Checking government registries',
  d4_credential_api: 'Verifying credentials',
  d4_hrms: 'Checking HR records',
  d4_ocr: 'Reading uploaded documents',
  d3_compose: 'Composing the answer',
  d3_report: 'Drafting compliance report'
};
