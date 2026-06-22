import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExpoAI,
  type CreateSessionOptions,
  type ExpoAIError,
  type ExpoAISession,
} from '@stewmore/expo-ai-core';

import { isCancelled, toError, useIsMounted } from './internal.js';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type UseChatResult = {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  /** Send a turn (defaults to the current `input`) and stream the assistant reply. */
  append: (content?: string) => Promise<void>;
  isLoading: boolean;
  error: ExpoAIError | null;
  /** Abort the in-flight reply. Cancellation is not surfaced as an error. */
  stop: () => void;
  /** Dispose the session and clear the transcript. */
  reset: () => Promise<void>;
};

/**
 * A streaming chat transcript over a cross-platform {@link ExpoAISession}. The
 * session is created lazily on the first `append` and disposed on unmount.
 * `options` is captured on first use; later changes are ignored.
 */
export function useChat(options?: CreateSessionOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ExpoAIError | null>(null);

  const sessionRef = useRef<ExpoAISession | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const optionsRef = useRef(options);
  const mounted = useIsMounted();

  const nextId = useCallback((role: ChatRole) => `${role}-${++idRef.current}`, []);

  const disposeSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    void session?.dispose().catch(() => {});
  }, []);

  // Abort the in-flight reply and dispose the session on unmount.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      disposeSession();
    },
    [disposeSession],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const append = useCallback(
    async (content?: string): Promise<void> => {
      const text = (content ?? input).trim();
      if (text.length === 0) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCurrent = () => controllerRef.current === controller;

      const assistantId = nextId('assistant');
      setMessages((prev) => [
        ...prev,
        { id: nextId('user'), role: 'user', content: text },
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      if (content === undefined) setInput('');
      setError(null);
      setIsLoading(true);

      try {
        if (!sessionRef.current) {
          // createSession is not abortable; if we unmounted (or another append
          // already created one) while it was pending, dispose this one.
          const created = await ExpoAI.createSession(optionsRef.current);
          if (!mounted.current || sessionRef.current) {
            void created.dispose().catch(() => {});
            if (!mounted.current) return;
          } else {
            sessionRef.current = created;
          }
        }
        const session = sessionRef.current;
        if (!session) return;
        for await (const chunk of session.stream({ prompt: text, signal: controller.signal })) {
          if (!isCurrent()) break;
          if (chunk.type === 'delta' && mounted.current) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + chunk.text }
                  : message,
              ),
            );
          }
        }
      } catch (caught) {
        const normalized = toError(caught);
        if (mounted.current && isCurrent()) {
          // Drop the still-empty assistant placeholder; surface the error instead.
          setMessages((prev) =>
            prev.filter((message) => !(message.id === assistantId && message.content === '')),
          );
          if (!isCancelled(normalized)) setError(normalized);
        }
      } finally {
        if (isCurrent()) {
          controllerRef.current = null;
          if (mounted.current) setIsLoading(false);
        }
      }
    },
    [input, mounted, nextId],
  );

  const reset = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (mounted.current) {
      setMessages([]);
      setError(null);
      setIsLoading(false);
    }
    await session?.dispose().catch(() => {});
  }, [mounted]);

  return { messages, input, setInput, append, isLoading, error, stop, reset };
}
