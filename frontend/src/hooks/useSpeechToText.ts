import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionCtor = SpeechRecognitionConstructor;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isSpeechToTextSupported(): boolean {
  return getSpeechRecognitionCtor() !== null && Boolean(navigator.mediaDevices?.getUserMedia);
}

function mapSpeechError(error: string): string | null {
  switch (error) {
    case 'aborted':
      return null;
    case 'not-allowed':
      return 'Permiso de micrófono denegado.';
    case 'no-speech':
      return 'No se detectó voz. Inténtalo de nuevo.';
    case 'network':
      return 'Comprueba tu conexión a internet e inténtalo de nuevo.';
    case 'audio-capture':
      return 'No se pudo acceder al micrófono.';
    case 'service-not-allowed':
      return 'El dictado por voz no está disponible en este contexto.';
    default:
      return 'No se pudo transcribir el audio.';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type UseSpeechToTextOptions = {
  lang?: string;
};

export function useSpeechToText({ lang = 'es-ES' }: UseSpeechToTextOptions = {}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef<(text: string) => void>(() => {});
  const onInterimRef = useRef<(text: string) => void>(() => {});
  const transcriptRef = useRef('');
  const userStoppedRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningElapsedSeconds, setListeningElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listeningStartedAtRef = useRef<number | null>(null);

  const flushTranscript = useCallback(() => {
    const trimmed = transcriptRef.current.trim();
    transcriptRef.current = '';
    if (trimmed) {
      onResultRef.current(trimmed);
    }
  }, []);

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const start = useCallback(
    async (onResult: (text: string) => void, onInterim?: (text: string) => void) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError('Tu navegador no admite dictado por voz.');
        return false;
      }

      if (recognitionRef.current) {
        stop();
        await wait(150);
      }

      onResultRef.current = onResult;
      onInterimRef.current = onInterim ?? (() => {});
      transcriptRef.current = '';
      userStoppedRef.current = false;
      setError(null);

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          transcript += event.results[i]?.[0]?.transcript ?? '';
        }
        transcriptRef.current = transcript;
        onInterimRef.current(transcript);
      };

      recognition.onerror = (event) => {
        const message = mapSpeechError(event.error);
        if (message && !userStoppedRef.current) {
          setError(message);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        flushTranscript();
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch {
        recognitionRef.current = null;
        setIsListening(false);
        setError('Permiso de microfono denegado.');
        return false;
      }

      try {
        recognition.start();
        return true;
      } catch {
        recognitionRef.current = null;
        setIsListening(false);
        setError('No se pudo iniciar la grabación de voz.');
        return false;
      }
    },
    [flushTranscript, lang, stop],
  );

  const toggle = useCallback(
    async (onResult: (text: string) => void, onInterim?: (text: string) => void) => {
      if (isListening) {
        stop();
        return;
      }
      await start(onResult, onInterim);
    },
    [isListening, start, stop],
  );

  useEffect(() => {
    if (!isListening) {
      setListeningElapsedSeconds(0);
      listeningStartedAtRef.current = null;
      return undefined;
    }

    listeningStartedAtRef.current = performance.now();
    setListeningElapsedSeconds(0);

    const tick = () => {
      const startedAt = listeningStartedAtRef.current;
      if (startedAt == null) return;
      setListeningElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000));
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [isListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    isListening,
    listeningElapsedSeconds,
    error,
    isSupported: isSpeechToTextSupported(),
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  };
}
