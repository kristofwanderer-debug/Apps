import { useRef, useState, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";

// Same public interface either way: { start, stop, isListening, interimText, supported }.
// - In a normal browser (including the plain web deployment), uses the Web
//   Speech API (window.SpeechRecognition / webkitSpeechRecognition).
// - Inside the packaged Android app, Capacitor's WebView does NOT implement
//   the Web Speech API, so this instead drives the device's native speech
//   recognizer through the @capacitor-community/speech-recognition plugin.
//   That plugin listens for one utterance at a time and stops after a pause
//   in speech, so continuous listening is simulated by restarting it
//   whenever it reports it has stopped, for as long as the viewer hasn't
//   paused voice input themselves.
export default function useSpeechRecognition({ onFinalResult, onCompletePhrase }) {
  const isNative = Capacitor.isNativePlatform();
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef(null);
  const shouldRestartRef = useRef(false);
  const lastFinalRef = useRef("");

  // ---- Web Speech API branch ----
  useEffect(() => {
    if (isNative) return;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (/session\s*complete/i.test(text)) onCompletePhrase?.();
          else if (text) onFinalResult?.(text);
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
    };
    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      } else {
        setIsListening(false);
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.warn("Speech recognition error:", e.error);
    };

    recognitionRef.current = recognition;
    return () => {
      shouldRestartRef.current = false;
      try { recognition.stop(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  // ---- Native (Capacitor) branch ----
  useEffect(() => {
    if (!isNative) return;
    let partialListener, stateListener;

    (async () => {
      try {
        const { available } = await NativeSpeech.available();
        if (!available) {
          setSupported(false);
          return;
        }
        const perm = await NativeSpeech.checkPermissions();
        if (perm.speechRecognition !== "granted") {
          const req = await NativeSpeech.requestPermissions();
          if (req.speechRecognition !== "granted") {
            setSupported(false);
            return;
          }
        }

        partialListener = await NativeSpeech.addListener("partialResults", (data) => {
          const text = (data.matches && data.matches[0]) || "";
          setInterimText(text);
        });

        stateListener = await NativeSpeech.addListener("listeningState", (data) => {
          if (data.status === "stopped" && shouldRestartRef.current) {
            // Native recognizer auto-stops after a pause in speech - restart
            // it to simulate continuous listening for as long as the viewer
            // hasn't paused voice input.
            startNative();
          }
        });
      } catch (e) {
        console.warn("Native speech recognition unavailable:", e);
        setSupported(false);
      }
    })();

    return () => {
      shouldRestartRef.current = false;
      partialListener?.remove();
      stateListener?.remove();
      NativeSpeech.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  const startNative = useCallback(async () => {
    try {
      setIsListening(true);
      const result = await NativeSpeech.start({
        language: "en-US",
        partialResults: true,
        popup: false,
        maxResults: 1,
      });
      const text = (result?.matches && result.matches[0]) || "";
      setInterimText("");
      if (text && text !== lastFinalRef.current) {
        lastFinalRef.current = text;
        if (/session\s*complete/i.test(text)) onCompletePhrase?.();
        else onFinalResult?.(text);
      }
      // If the viewer hasn't paused voice input, the "listeningState" stopped
      // event (registered above) will restart listening automatically.
    } catch {
      setIsListening(false);
    }
  }, [onFinalResult, onCompletePhrase]);

  const start = useCallback(() => {
    if (isNative) {
      shouldRestartRef.current = true;
      startNative();
      return;
    }
    if (!recognitionRef.current) return;
    shouldRestartRef.current = true;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch { /* already running */ }
  }, [isNative, startNative]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    setIsListening(false);
    setInterimText("");
    if (isNative) {
      NativeSpeech.stop().catch(() => {});
      return;
    }
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  }, [isNative]);

  return { start, stop, isListening, interimText, supported };
}
