import { useState, useCallback, useRef } from "react";
import IdleScreen from "./components/IdleScreen.jsx";
import CoordinateScreen from "./components/CoordinateScreen.jsx";
import ListeningScreen from "./components/ListeningScreen.jsx";
import AnalyzingScreen from "./components/AnalyzingScreen.jsx";
import RevealScreen from "./components/RevealScreen.jsx";
import HistoryScreen from "./components/HistoryScreen.jsx";
import { newSession, finishSession, abortSession } from "./api.js";

// Idle -> Coordinate -> Listening -> Analyzing -> Reveal -> (New Session -> Idle)
//                                                          \-> History (from Idle)
export default function App() {
  const [view, setView] = useState("idle");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [coordinate, setCoordinate] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [sketches, setSketches] = useState([]);
  const sessionIdRef = useRef(null);

  const handleStart = useCallback(async (numControls) => {
    setStarting(true);
    setError("");
    try {
      const res = await newSession(numControls);
      setSessionId(res.sessionId);
      sessionIdRef.current = res.sessionId;
      setCoordinate(res.coordinate);
      setView("coordinate");
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }, []);

  const handleBeginListening = useCallback(() => {
    setView("listening");
  }, []);

  const handleFinished = useCallback(async (capturedSketches) => {
    setSketches(capturedSketches || []);
    setView("analyzing");
    try {
      const res = await finishSession(sessionIdRef.current);
      setAnalysis(res.analysis);
      setReveal(res.reveal);
      setView("reveal");
    } catch (e) {
      setError(e.message);
      setView("idle");
    }
  }, []);

  const handleListeningError = useCallback((msg) => {
    setError(msg);
  }, []);

  const handleNewSession = useCallback(() => {
    setAnalysis(null);
    setReveal(null);
    setSketches([]);
    setSessionId(null);
    sessionIdRef.current = null;
    setView("idle");
  }, []);

  const handleViewHistory = useCallback(() => setView("history"), []);

  const handleCloseHistory = useCallback(() => setView("idle"), []);

  if (view === "history") {
    return <HistoryScreen onBack={handleCloseHistory} />;
  }

  if (view === "listening" && sessionId) {
    return <ListeningScreen sessionId={sessionId} onFinished={handleFinished} onError={handleListeningError} />;
  }

  if (view === "analyzing") {
    return (
      <div className="app-shell">
        <AnalyzingScreen />
      </div>
    );
  }

  if (view === "reveal" && analysis && reveal) {
    return (
      <div className="app-shell">
        <RevealScreen coordinate={coordinate} analysis={analysis} reveal={reveal} sketches={sketches} onNewSession={handleNewSession} />
      </div>
    );
  }

  if (view === "coordinate" && coordinate) {
    return (
      <div className="app-shell">
        <CoordinateScreen
          coordinate={coordinate}
          onBegin={handleBeginListening}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <IdleScreen onStart={handleStart} onViewHistory={handleViewHistory} starting={starting} error={error} />
    </div>
  );
}
