import { useState, useMemo } from "react";

function verdictClass(verdict) {
  if (/above all controls/i.test(verdict)) return "above";
  if (/below all controls/i.test(verdict)) return "below";
  return "chance";
}

function pct(x) {
  if (x === null || x === undefined) return "—";
  return `${Math.round(x * 100)}%`;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RevealScreen({ coordinate, analysis, reveal, sketches, onNewSession }) {
  const [showControls, setShowControls] = useState(false);
  const vClass = verdictClass(analysis.verdict);

  const stageRows = useMemo(
    () =>
      ["1", "2", "3"].map((s) => {
        const b = analysis.stage_breakdown[s] || { hits: 0, partials: 0, misses: 0 };
        const total = b.hits + b.partials + b.misses;
        return { stage: s, ...b, total, rate: total > 0 ? (b.hits + 0.5 * b.partials) / total : null };
      }),
    [analysis]
  );

  const stageNames = { 1: "Gestalts & Sketch", 2: "Sensory", 3: "Dimensional" };

  return (
    <div className="app-shell">
      <div className="top-nav">
        <h1>Session Analysis</h1>
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{coordinate}</span>
      </div>

      <div className="section">
        <div className="stat-grid">
          <div className="stat-tile"><div className="n hit">{analysis.overall.hits}</div><div className="l">Hits</div></div>
          <div className="stat-tile"><div className="n partial">{analysis.overall.partials}</div><div className="l">Partials</div></div>
          <div className="stat-tile"><div className="n miss">{analysis.overall.misses}</div><div className="l">Misses</div></div>
        </div>
        <p style={{ textAlign: "center" }}>
          Target accuracy score: <strong style={{ color: "var(--text)" }}>{pct(analysis.target_accuracy_score)}</strong>
        </p>
      </div>

      <div className="section">
        <div className="section-title">Control Comparison</div>
        <div style={{ textAlign: "center" }}>
          <div className={`verdict-badge ${vClass}`}>{analysis.verdict}</div>
        </div>
        <div className="stat-grid">
          <div className="stat-tile"><div className="n">{pct(analysis.avg_control_score)}</div><div className="l">Avg control score</div></div>
          <div className="stat-tile"><div className="n">{analysis.lift >= 0 ? "+" : ""}{pct(analysis.lift)}</div><div className="l">Lift</div></div>
          <div className="stat-tile"><div className="n">#{analysis.target_rank} of {analysis.num_images}</div><div className="l">Target rank</div></div>
        </div>
        <p style={{ textAlign: "center", fontSize: "0.78rem" }}>
          Chance rate for 1st place: {pct(analysis.chance_rate)}
        </p>
      </div>

      <div className="section">
        <div className="section-title">Per-Stage Hit Rate (vs. target)</div>
        {stageRows.map((r) => (
          <div className="impression-row" key={r.stage}>
            <div style={{ flex: 1 }}>
              <div className="impression-text">Stage {r.stage} · {stageNames[r.stage]}</div>
              <div className="impression-reason">
                {r.hits}H / {r.partials}P / {r.misses}M — {pct(r.rate)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">Impressions</div>
        {analysis.per_impression.length === 0 && <p>No text/voice impressions were logged.</p>}
        {analysis.per_impression.map((p, i) => (
          <div className="impression-row" key={i}>
            <span className={`verdict-pill ${p.verdict}`}>{p.verdict}</span>
            <div>
              <div className="impression-text">{p.text}</div>
              <div className="impression-reason">{p.reason}</div>
            </div>
          </div>
        ))}
        {analysis.sketch_notes.map((s, i) => (
          <div className="impression-row" key={`sk-${i}`}>
            <span className={`verdict-pill ${s.verdict}`}>{s.verdict}</span>
            <div>
              <div className="impression-text">Stage {s.stage} sketch</div>
              <div className="impression-reason">{s.reason}</div>
            </div>
          </div>
        ))}
      </div>

      {analysis.notable_missed?.length > 0 && (
        <div className="section">
          <div className="section-title">Notable Elements Not Mentioned</div>
          <ul style={{ margin: 0, paddingLeft: "1.2em", color: "var(--text-dim)" }}>
            {analysis.notable_missed.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {sketches?.length > 0 && (
        <div className="section">
          <div className="section-title">Your Sketches</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {sketches.map((s, i) => (
              <div key={i}>
                <img className="sketch-thumb" src={s.dataUrl} alt={`Stage ${s.stage} sketch`} />
                <div className="credit-line">Stage {s.stage}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Target</div>
        <img className="reveal-image" src={reveal.target.imageUrl} alt="Revealed target" />
        <div className="credit-line">
          © {reveal.target.author} · {reveal.target.license} ·{" "}
          <a className="link" href={reveal.target.sourceUrl} target="_blank" rel="noreferrer">source</a>
        </div>
      </div>

      <div className="section">
        <div className="toggle-row">
          <div className="section-title" style={{ marginBottom: 0 }}>Controls</div>
          <button type="button" className="btn" onClick={() => setShowControls((v) => !v)}>
            {showControls ? "Hide Controls" : "Show Controls"}
          </button>
        </div>
        {showControls && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {analysis.controls.map((c, i) => (
              <div key={i}>
                <img className="reveal-image" src={c.imageUrl} alt={`Control ${i + 1}`} />
                <div className="credit-line">
                  © {c.author} · {c.license} ·{" "}
                  <a className="link" href={c.sourceUrl} target="_blank" rel="noreferrer">source</a> · score {pct(c.accuracy_score)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="footer-actions">
        <button
          className="btn btn-block"
          onClick={() => downloadJson(`rv-session-${coordinate}.json`, { coordinate, analysis, reveal, sketches })}
        >
          Save Session Log
        </button>
        <button className="btn btn-primary btn-block" onClick={onNewSession}>New Session</button>
      </div>
    </div>
  );
}
