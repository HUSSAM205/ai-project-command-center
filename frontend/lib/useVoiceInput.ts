"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the browser's native SpeechRecognition API -- not in TypeScript's DOM lib
 * under the vendor-prefixed name, and only partially under the unprefixed one depending on the
 * TS/lib version pinned here, so this is typed locally rather than relying on ambient globals. */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Streams live speech-to-text into `onTranscript` (called with the accumulated text so far on
 * every interim and final result -- the caller just sets its input value to it directly, same as
 * typing). `supported` is false in a browser with no SpeechRecognition implementation at all
 * (e.g. Firefox as of this writing) -- callers should show a plain, honest "not supported" tip
 * rather than a broken mic button. `permissionDenied` distinguishes the other real failure mode
 * (browser supports it, the user said no) so the caller can show a different, accurate tip. */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const supported = getRecognitionCtor() !== null;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const start = useCallback(
    (currentText: string) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;
      setPermissionDenied(false);
      baseTextRef.current = currentText ? `${currentText} ` : "";
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (e) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        onTranscript(baseTextRef.current + transcript);
      };
      recognition.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") setPermissionDenied(true);
        setListening(false);
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    },
    [onTranscript],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, permissionDenied, start, stop };
}
