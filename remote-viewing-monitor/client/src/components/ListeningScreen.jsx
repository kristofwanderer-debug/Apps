import { useState, useRef, useCallback, useEffect } from "react";
import SketchCanvas from "./SketchCanvas.jsx";
import useSpeechRecognition from "../hooks/useSpeechRecognition.js";
import { logImpression, logSketch } from "../api.js";

const STAGE_INFO = {
  1: { title: "Stage 1 · Gestalts & Sketch", placeholder: "Land, water, structure, natural, man-made, movement, energy…" },
  2: { title: "Stage 2 · Sensory", placeholder: "Colors, textures, temperatures, sounds, smells, tastes, materials…" },
  3: { title: "Stage 3 · Dimensional", placeholder: "Size, height, width, depth, spatial layout, number of objects…" },
};

const STAGE2_CHIPS = ["Colors", "Textures", "Temperatures", "Sounds", "Smells", "Tastes", "Materials"];
const STAGE3_CHIPS = ["Size", "Height", "Width", "Depth", "Vertical/Horizontal", "Spatial layout", "Number of objects/people"];

export default function ListeningScreen({ sessionId, onFinished, onError }) {
  const [stage, setStage] = useState(1);
  const [text, setText] = useState("");
  const [activeChip, setActiveChip] = useState(null);
  const [log, setLog] = useState([]); // local mirror for the transcript display
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const sketch1Ref = useRef(null);
  const sketch3Ref = useRef(null);
  const logEndRef = useRef(null);
  const capturedSketchesRef = useRef([]);

  const appendLocal = useCallback((entry) => {
    setLog((prev) => [...prev, entry]);
  }, []);

  const submitImpression = useCallback(
    (rawText, inputMode) => {
      const category = stageRef.current === 2 || stageRef.current === 3 ? activeChip : null;
      const finalText = category ? `${category}: ${rawText}` : rawText;
      const entry = { stage: String(stageRef.current), text: finalText, input_mode: inputMode, timestamp: new Date().toISOString() };
      appendLocal(entry);
      logImpression(sessionId, entry.stage, entry.text, inputMode).catch((e) => onError?.(e.message));
    },
    [activeChip, appendLocal, sessionId, onError]
  );

  const handleFinishedRef = useRef();

  const speech = useSpeechRecognition({
    onFinalResult: (t) => submitImpression(t, "voice"),
    onCompletePhrase: () => handleFinishedRef.current?.(),
  });

  useEffect(() => {
    speech.start();
    return () => speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log]);

  const submitTyped = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submitImpression(trimmed, "text");
    setText("");
  }, [text, submitImpression]);

  const submitNote = useCallback(() => {
    const trimmed = notesText.trim();
    if (!trimmed) return;
    const entry = { stage: String(stageRef.current), text: `[Free Notes] ${trimmed}`, input_mode: "text", timestamp: new Date().toISOString() };
    appendLocal(entry);
    logImpression(sessionId, entry.stage, entry.text, "text").catch((e) => onError?.(e.message));
    setNotesText("");
  }, [notesText, appendLocal, sessionId, onError]);

  const flushSketch = useCallback(
    async (stageNum, ref) => {
      if (!ref.current || ref.current.isBlank()) return;
      const dataUrl = ref.current.exportDataUrl();
      try {
        await logSketch(sessionId, String(stageNum), dataUrl);
        capturedSketchesRef.current.push({ stage: String(stageNum), dataUrl });
        appendLocal({ stage: String(stageNum), text: "(sketch captured)", input_mode: "sketch", timestamp: new Date().toISOString() });
      } catch (e) {
        onError?.(e.message);
      }
    },
    [sessionId, appendLocal, onError]
  );

  const goToStage2 = useCallback(async () => {
    await flushSketch(1, sketch1Ref);
    setActiveChip(null);
    setStage(2);
  }, [flushSketch]);

  const goToStage3 = useCallback(() => {
    setActiveChip(null);
    setStage(3);
  }, []);

  const handleFinished = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    speech.stop();
    await flushSketch(3, sketch3Ref);
    onFinished(capturedSketchesRef.current);
  }, [finishing, speech, flushSketch, onFinished]);

  handleFinishedRef.current = handleFinished;

  const chips = stage === 2 ? STAGE2_CHIPS : stage === 3 ? STAGE3_CHIPS : [];
  const info = STAGE_INFO[stage];

  return (
    <div className="app-shell" style={{ padding: 0 }}>
      <div className="stage-header">
        <div className="stage-label">
          <strong>{info.title}</strong>
        </div>
        <div className="rec-indicator">
          <span className={`rec-dot ${speech.isListening ? "" : "off"}`} />
          {speech.supported ? "Recording" : "Voice unavailable — typing only"}
        </div>
      </div>

      <div className="listening-body">
        {stage === 1 && <SketchCanvas ref={sketch1Ref} label="Ideogram / quick sketch" />}
        {stage === 3 && <SketchCanvas ref={sketch3Ref} label="Detailed sketch / layout map" />}

        {chips.length > 0 && (
          <div className="chip-row">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${activeChip === c ? "active" : ""}`}
                onClick={() => setActiveChip(activeChip === c ? null : c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="input-bar">
          <textarea
            rows={2}
            placeholder={activeChip ? `${activeChip}…` : info.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitTyped();
              }
            }}
          />
          <button
            type="button"
            className={`mic-btn ${speech.isListening ? "active" : ""}`}
            onClick={() => (speech.isListening ? speech.stop() : speech.start())}
            title={speech.isListening ? "Voice logging on" : "Voice logging paused"}
          >
            {speech.isListening ? "●" : "◌"}
          </button>
        </div>
        {speech.interimText && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>hearing: {speech.interimText}</div>}

        <div className="transcript-log">
          {log.length === 0 && <div className="empty">Impressions will appear here as you log them.</div>}
          {log.map((entry, i) => (
            <div className="entry" key={i}>
              <span className="tag">Stage {entry.stage}</span>
              <span className="txt">{entry.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <div>
          <button type="button" className="btn btn-block btn-ghost" onClick={() => setNotesOpen((v) => !v)}>
            {notesOpen ? "Hide Free Notes" : "Free Notes"}
          </button>
          {notesOpen && (
            <div className="free-notes-panel">
              <div className="input-bar">
                <textarea
                  rows={2}
                  placeholder="Anything that doesn't fit a stage…"
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitNote();
                    }
                  }}
                />
                <button type="button" className="btn" onClick={submitNote}>Log</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer-actions">
        {stage === 1 && (
          <button className="btn btn-primary btn-block" onClick={goToStage2}>Next Stage →</button>
        )}
        {stage === 2 && (
          <button className="btn btn-primary btn-block" onClick={goToStage3}>Next Stage →</button>
        )}
        {stage === 3 && (
          <button className="btn btn-primary btn-block" disabled={finishing} onClick={handleFinished}>
            {finishing ? "Finishing…" : "Finished"}
          </button>
        )}
      </div>
    </div>
  );
}
