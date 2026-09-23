import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  getHistory,
  getHistoryStats,
  getHistorySession,
  deleteHistorySession,
  deleteAllHistory,
  exportHistoryUrl,
} from "../api.js";

function pct(x) {
  if (x === null || x === undefined) return "—";
  return `${Math.round(x * 100)}%`;
}

function SessionDetail({ id, onBack }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getHistorySession(id).then(setSession).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!session) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div>
      <button className="btn" onClick={onBack}>← Back to History</button>
      <div className="section">
        <h2>{session.coordinate}</h2>
        <p>{new Date(session.created_at).toLocaleString()}</p>
        <div className="stat-grid">
          <div className="stat-tile"><div className="n hit">{session.overall_hits}</div><div className="l">Hits</div></div>
          <div className="stat-tile"><div className="n partial">{session.overall_partials}</div><div className="l">Partials</div></div>
          <div className="stat-tile"><div className="n miss">{session.overall_misses}</div><div className="l">Misses</div></div>
        </div>
        <p style={{ textAlign: "center" }}>
          Target score {pct(session.target_accuracy_score)} · Avg control {pct(session.avg_control_score)} · Lift {session.lift >= 0 ? "+" : ""}{pct(session.lift)} · Rank #{session.target_rank}
        </p>
        <div className="verdict-badge chance" style={{ display: "block", textAlign: "center" }}>{session.verdict}</div>
      </div>

      <div className="section">
        <div className="section-title">Impressions</div>
        {session.impressions.map((imp, i) => (
          <div className="impression-row" key={i}>
            <div>
              <div className="impression-text">[{imp.stage}] {imp.text}</div>
              <div className="impression-reason">{new Date(imp.timestamp).toLocaleTimeString()} · {imp.input_mode}</div>
            </div>
          </div>
        ))}
      </div>

      {session.sketches?.length > 0 && (
        <div className="section">
          <div className="section-title">Sketches</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {session.sketches.map((s, i) => (
              <img key={i} className="sketch-thumb" src={s.data_url} alt={`Stage ${s.stage} sketch`} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Target</div>
        <div className="credit-line">
          © {session.target_meta.author} · {session.target_meta.license} ·{" "}
          <a className="link" href={session.target_meta.source_url} target="_blank" rel="noreferrer">source</a>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Controls</div>
        {session.controls_meta.map((c, i) => (
          <div key={i} className="credit-line" style={{ marginBottom: "6px" }}>
            score {pct(c.accuracy_score)} · © {c.author} · {c.license} ·{" "}
            <a className="link" href={c.source_url} target="_blank" rel="noreferrer">source</a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoryScreen({ onBack }) {
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const load = useCallback(() => {
    Promise.all([getHistoryStats(), getHistory()])
      .then(([s, list]) => {
        setStats(s);
        setSessions(list);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedId) {
    return (
      <div className="app-shell">
        <SessionDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="top-nav">
        <h1>History</h1>
        <button className="btn" onClick={onBack}>Close</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!stats && !error && <div className="center-screen"><div className="spinner" /></div>}

      {stats && stats.total_sessions === 0 && (
        <p>No sessions recorded yet. Run a session to start building your history.</p>
      )}

      {stats && stats.total_sessions > 0 && (
        <>
          <div className="section">
            <div className="stat-grid">
              <div className="stat-tile"><div className="n">{stats.total_sessions}</div><div className="l">Sessions</div></div>
              <div className="stat-tile"><div className="n">{pct(stats.overall_hit_rate)}</div><div className="l">Overall hit rate</div></div>
              <div className="stat-tile"><div className="n">{stats.avg_lift >= 0 ? "+" : ""}{pct(stats.avg_lift)}</div><div className="l">Avg lift</div></div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Target Accuracy Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.trend.map((t, i) => ({ ...t, idx: i + 1 }))}>
                <CartesianGrid stroke="#262b38" strokeDasharray="3 3" />
                <XAxis dataKey="idx" stroke="#8a90a2" fontSize={11} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} stroke="#8a90a2" fontSize={11} width={40} />
                <Tooltip
                  formatter={(v) => `${Math.round(v * 100)}%`}
                  contentStyle={{ background: "#171b25", border: "1px solid #262b38", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Line type="monotone" dataKey="target_accuracy_score" name="Target" stroke="#5eead4" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="rolling_avg_target" name="5-session avg" stroke="#facc15" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg_control_score" name="Chance (avg control)" stroke="#8a90a2" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="section">
            <div className="section-title">First-Place Rank vs. Chance</div>
            <p>
              Target ranked #1 in {stats.first_place.count} of {stats.total_sessions} sessions ({pct(stats.first_place.rate)}),
              vs. an average chance rate of {pct(stats.first_place.chance_rate)}.
            </p>
            <p style={{ fontSize: "0.82rem" }}>
              Binomial p-value: {stats.first_place.p_value?.toFixed(4)} — informational only; a small number of sessions can't support strong conclusions.
            </p>
          </div>

          <div className="section">
            <div className="section-title">Per-Stage Hit Rate</div>
            {["1", "2", "3"].map((s) => (
              <div className="impression-row" key={s}>
                <div style={{ flex: 1 }}>
                  <div className="impression-text">Stage {s}</div>
                  <div className="impression-reason">
                    {stats.per_stage[s]?.hits ?? 0}H / {stats.per_stage[s]?.partials ?? 0}P / {stats.per_stage[s]?.misses ?? 0}M — {pct(stats.per_stage[s]?.hit_rate)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="section">
            <div className="section-title">Best / Worst by Lift</div>
            {stats.best_session && (
              <div className="history-list-item" onClick={() => setSelectedId(stats.best_session.id)}>
                <div>
                  <div>Best: {stats.best_session.coordinate}</div>
                  <div className="history-meta">{new Date(stats.best_session.created_at).toLocaleDateString()}</div>
                </div>
                <div className="n hit">+{pct(stats.best_session.lift)}</div>
              </div>
            )}
            {stats.worst_session && (
              <div className="history-list-item" onClick={() => setSelectedId(stats.worst_session.id)}>
                <div>
                  <div>Worst: {stats.worst_session.coordinate}</div>
                  <div className="history-meta">{new Date(stats.worst_session.created_at).toLocaleDateString()}</div>
                </div>
                <div className="n miss">{pct(stats.worst_session.lift)}</div>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-title">All Sessions</div>
            {sessions.map((s) => (
              <div key={s.id} className="history-list-item" onClick={() => setSelectedId(s.id)}>
                <div>
                  <div>{s.coordinate}</div>
                  <div className="history-meta">{new Date(s.created_at).toLocaleString()}</div>
                </div>
                <div>{pct(s.target_accuracy_score)}</div>
              </div>
            ))}
          </div>

          <div className="section btn-row">
            <a className="btn" href={exportHistoryUrl("csv")}>Export CSV</a>
            <a className="btn" href={exportHistoryUrl("json")}>Export JSON</a>
          </div>

          <div className="section">
            {!confirmDeleteAll ? (
              <button className="btn btn-danger btn-block" onClick={() => setConfirmDeleteAll(true)}>Delete All History</button>
            ) : (
              <div className="btn-row">
                <button className="btn btn-block" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
                <button
                  className="btn btn-danger btn-block"
                  onClick={() => deleteAllHistory().then(() => { setConfirmDeleteAll(false); load(); })}
                >
                  Confirm Delete All
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
