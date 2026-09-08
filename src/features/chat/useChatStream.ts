import { useCallback, useRef, useState } from 'react';
import { chatApi } from '../../services/api';
import type { ChatStreamEvent, ProgressEvent } from '../../types/events';

interface UseChatStreamResult {
  /** Non-terminal progress events for the in-flight job, in first-seen order. */
  liveSteps: ProgressEvent[];
  /** True while a stream connection is open and no terminal event has arrived yet. */
  isStreaming: boolean;
  /**
   * Opens GET /chat/stream/{jobId} and resolves once a terminal event
   * (complete/error/awaiting_approval) arrives. Cancels any prior in-flight
   * stream first. Rejects if the connection drops or ends without ever
   * reaching a terminal event.
   */
  startStream: (jobId: string) => Promise<ChatStreamEvent>;
  /** Aborts the current stream, if any (e.g. on unmount). */
  cancelStream: () => void;
}

export function useChatStream(): UseChatStreamResult {
  const [liveSteps, setLiveSteps] = useState<ProgressEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const startStream = useCallback((jobId: string): Promise<ChatStreamEvent> => {
    cancelStream();
    setLiveSteps([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let settled = false;

    return new Promise<ChatStreamEvent>((resolve, reject) => {
      chatApi
        .streamJob(jobId, {
          signal: controller.signal,
          onEvent: (evt) => {
            if (evt.step === 'complete' || evt.step === 'error' || evt.step === 'awaiting_approval') {
              settled = true;
              setIsStreaming(false);
              resolve(evt);
              return;
            }

            setLiveSteps((prev) => {
              const idx = prev.findIndex((s) => s.step === evt.step);
              if (idx === -1) return [...prev, evt];
              const next = [...prev];
              next[idx] = evt;
              return next;
            });
          }
        })
        .then(() => {
          if (settled) return;
          // Stream ended (server closed the connection) without a terminal event.
          setIsStreaming(false);
          reject(new Error('Stream ended unexpectedly before completion'));
        })
        .catch((err: any) => {
          if (settled || controller.signal.aborted) return; // already resolved, or a deliberate cancel
          setIsStreaming(false);
          reject(err instanceof Error ? err : new Error('Connection to stream lost'));
        });
    });
  }, [cancelStream]);

  return { liveSteps, isStreaming, startStream, cancelStream };
}
