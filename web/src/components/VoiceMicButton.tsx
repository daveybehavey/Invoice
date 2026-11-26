import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function VoiceMicButton({
  onTranscript,
  onFinished,
  onUnsupported,
  label = "Tap & Talk",
  variant = "compact",
  className = ""
}: {
  onTranscript: (text: string) => void;
  onFinished?: () => void;
  onUnsupported?: () => void;
  label?: string;
  variant?: "compact" | "truck";
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const capturedAnyRef = useRef(false);

  useEffect(() => {
    if (!listening) {
      setSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [listening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggle = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      if (capturedAnyRef.current) {
        onFinished?.();
      }
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechCtor) {
      onUnsupported?.();
      return;
    }

    capturedAnyRef.current = false;
    const rec = new SpeechCtor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.[0]?.transcript) {
          parts.push(result[0].transcript.trim());
        }
      }
      if (parts.length > 0) {
        capturedAnyRef.current = true;
        onTranscript(parts.join(" "));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (capturedAnyRef.current) {
        onFinished?.();
      }
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  if (variant === "truck") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold transition ${
          listening
            ? "animate-pulse border-[#9F1239] bg-[#FFF1F2] text-[#9F1239]"
            : "border-[#0F5132]/25 bg-[#E8F5EE] text-[#0F5132] hover:bg-[#0F5132] hover:text-white"
        } ${className}`}
      >
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        <span>{listening ? `Recording (${seconds}s) — Tap to build invoice` : label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
        listening
          ? "animate-pulse border-[#9F1239] bg-[#FFF1F2] text-[#9F1239]"
          : "border-[#D9E0DC] bg-white text-[#101915] hover:border-[#0F5132]/40 hover:bg-[#F5F6F2]"
      } ${className}`}
    >
      {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-[#0F5132]" />}
      <span>{listening ? `Listening ${seconds}s...` : label}</span>
    </button>
  );
}
