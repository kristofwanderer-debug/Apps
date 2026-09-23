import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets you point history storage at a persistent disk mount (e.g.
// Render's paid-tier Disks, mounted at something like /var/data). Without
// it, this defaults to a local folder next to the source - fine for local
// dev, but note that on a host with an ephemeral filesystem (such as
// Render's free plan) this file is wiped on every restart/redeploy.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "history.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  coordinate TEXT NOT NULL,
  num_controls INTEGER NOT NULL,

  overall_hits INTEGER NOT NULL,
  overall_partials INTEGER NOT NULL,
  overall_misses INTEGER NOT NULL,

  stage_breakdown_json TEXT NOT NULL,   -- {stage1:{hits,partials,misses}, stage2:{...}, stage3:{...}}

  target_accuracy_score REAL NOT NULL,
  avg_control_score REAL NOT NULL,
  lift REAL NOT NULL,
  target_rank INTEGER NOT NULL,
  chance_rate REAL NOT NULL,
  verdict TEXT NOT NULL,

  target_meta_json TEXT NOT NULL,       -- {source_url, author, license, description}
  controls_meta_json TEXT NOT NULL,     -- [{source_url, author, license, accuracy_score, description}]

  impressions_json TEXT NOT NULL,       -- [{stage, timestamp, text, input_mode}]
  sketches_json TEXT NOT NULL,          -- [{stage, timestamp, data_url}]
  grading_json TEXT NOT NULL,           -- full per-image grading detail vs target + controls
  notable_missed_json TEXT NOT NULL     -- [string]
);
`);

export function insertSession(record) {
  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, created_at, coordinate, num_controls,
      overall_hits, overall_partials, overall_misses,
      stage_breakdown_json,
      target_accuracy_score, avg_control_score, lift, target_rank, chance_rate, verdict,
      target_meta_json, controls_meta_json,
      impressions_json, sketches_json, grading_json, notable_missed_json
    ) VALUES (
      @id, @created_at, @coordinate, @num_controls,
      @overall_hits, @overall_partials, @overall_misses,
      @stage_breakdown_json,
      @target_accuracy_score, @avg_control_score, @lift, @target_rank, @chance_rate, @verdict,
      @target_meta_json, @controls_meta_json,
      @impressions_json, @sketches_json, @grading_json, @notable_missed_json
    )
  `);
  stmt.run(record);
}

export function listSessions() {
  return db.prepare(`
    SELECT id, created_at, coordinate, num_controls,
           overall_hits, overall_partials, overall_misses,
           target_accuracy_score, avg_control_score, lift, target_rank, chance_rate, verdict
    FROM sessions ORDER BY created_at DESC
  `).all();
}

export function getSession(id) {
  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    ...row,
    stage_breakdown: JSON.parse(row.stage_breakdown_json),
    target_meta: JSON.parse(row.target_meta_json),
    controls_meta: JSON.parse(row.controls_meta_json),
    impressions: JSON.parse(row.impressions_json),
    sketches: JSON.parse(row.sketches_json),
    grading: JSON.parse(row.grading_json),
    notable_missed: JSON.parse(row.notable_missed_json),
  };
}

export function deleteSession(id) {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

export function deleteAllSessions() {
  db.prepare(`DELETE FROM sessions`).run();
}

export function getAllSessionsFull() {
  const rows = db.prepare(`SELECT * FROM sessions ORDER BY created_at ASC`).all();
  return rows.map((row) => ({
    ...row,
    stage_breakdown: JSON.parse(row.stage_breakdown_json),
    target_meta: JSON.parse(row.target_meta_json),
    controls_meta: JSON.parse(row.controls_meta_json),
    impressions: JSON.parse(row.impressions_json),
    sketches: JSON.parse(row.sketches_json),
    grading: JSON.parse(row.grading_json),
    notable_missed: JSON.parse(row.notable_missed_json),
  }));
}

export default db;
