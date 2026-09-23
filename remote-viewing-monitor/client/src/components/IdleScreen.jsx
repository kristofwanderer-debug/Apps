import { useState } from "react";

export default function IdleScreen({ onStart, onViewHistory, starting, error }) {
  const [numControls, setNumControls] = useState(3);

  return (
    <div className="center-screen">
      <h1>Remote Viewing Monitor</h1>
      <p>
        A blind session monitor. The target and control images stay hidden on
        the server until your session ends and analysis is complete.
      </p>

      <div>
        <div className="section-title">Number of control images</div>
        <div className="select-pill-group">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`select-pill ${numControls === n ? "active" : ""}`}
              onClick={() => setNumControls(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button className="btn btn-primary btn-block" disabled={starting} onClick={() => onStart(numControls)}>
        {starting ? "Preparing session…" : "New Session"}
      </button>
      <button className="btn btn-block" onClick={onViewHistory}>View History</button>
    </div>
  );
}
