import { Router } from "express";
import { listSessions, getSession, deleteSession, deleteAllSessions, getAllSessionsFull } from "../db.js";
import { binomialUpperTailPValue, rollingAverage } from "../stats.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(listSessions());
});

router.get("/stats", (req, res) => {
  const sessions = listSessions(); // ascending needed for trend - re-sort
  const asc = sessions.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const totalSessions = asc.length;
  if (totalSessions === 0) {
    return res.json({
      total_sessions: 0,
      overall_hit_rate: null,
      avg_lift: null,
      trend: [],
      first_place: { count: 0, rate: null, chance_rate: null, p_value: null },
      per_stage: {},
      best_session: null,
      worst_session: null,
    });
  }

  const totalHits = asc.reduce((s, r) => s + r.overall_hits, 0);
  const totalPartials = asc.reduce((s, r) => s + r.overall_partials, 0);
  const totalMisses = asc.reduce((s, r) => s + r.overall_misses, 0);
  const totalImpressions = totalHits + totalPartials + totalMisses;
  const overallHitRate = totalImpressions > 0 ? (totalHits + 0.5 * totalPartials) / totalImpressions : null;

  const avgLift = asc.reduce((s, r) => s + r.lift, 0) / totalSessions;

  const targetScores = asc.map((r) => r.target_accuracy_score);
  const controlScores = asc.map((r) => r.avg_control_score);
  const rollingTarget = rollingAverage(targetScores, 5);
  const trend = asc.map((r, i) => ({
    session_id: r.id,
    date: r.created_at,
    target_accuracy_score: r.target_accuracy_score,
    avg_control_score: r.avg_control_score,
    rolling_avg_target: rollingTarget[i],
  }));

  const firstPlaceCount = asc.filter((r) => r.target_rank === 1).length;
  const firstPlaceRate = firstPlaceCount / totalSessions;
  const avgChanceRate = asc.reduce((s, r) => s + r.chance_rate, 0) / totalSessions;
  const pValue = binomialUpperTailPValue(totalSessions, firstPlaceCount, avgChanceRate);

  // Per-stage hit rate needs the full stage_breakdown, so pull full rows.
  const full = getAllSessionsFull();
  const stageTotals = {
    "1": { hits: 0, partials: 0, misses: 0 },
    "2": { hits: 0, partials: 0, misses: 0 },
    "3": { hits: 0, partials: 0, misses: 0 },
  };
  for (const s of full) {
    for (const stage of ["1", "2", "3"]) {
      const b = s.stage_breakdown[stage];
      if (!b) continue;
      stageTotals[stage].hits += b.hits;
      stageTotals[stage].partials += b.partials;
      stageTotals[stage].misses += b.misses;
    }
  }
  const perStage = {};
  for (const stage of ["1", "2", "3"]) {
    const t = stageTotals[stage];
    const total = t.hits + t.partials + t.misses;
    perStage[stage] = {
      ...t,
      total,
      hit_rate: total > 0 ? (t.hits + 0.5 * t.partials) / total : null,
    };
  }

  const byLiftDesc = asc.slice().sort((a, b) => b.lift - a.lift);
  const bestSession = byLiftDesc[0] || null;
  const worstSession = byLiftDesc[byLiftDesc.length - 1] || null;

  res.json({
    total_sessions: totalSessions,
    overall_hit_rate: overallHitRate,
    avg_lift: avgLift,
    trend,
    first_place: {
      count: firstPlaceCount,
      rate: firstPlaceRate,
      chance_rate: avgChanceRate,
      p_value: pValue,
    },
    per_stage: perStage,
    best_session: bestSession,
    worst_session: worstSession,
  });
});

router.get("/export", (req, res) => {
  const format = (req.query.format || "json").toLowerCase();
  const sessions = getAllSessionsFull();

  if (format === "csv") {
    const headers = [
      "id", "created_at", "coordinate", "num_controls",
      "overall_hits", "overall_partials", "overall_misses",
      "target_accuracy_score", "avg_control_score", "lift", "target_rank", "chance_rate", "verdict",
      "target_source_url", "target_author", "target_license",
    ];
    const lines = [headers.join(",")];
    for (const s of sessions) {
      const row = [
        s.id, s.created_at, s.coordinate, s.num_controls,
        s.overall_hits, s.overall_partials, s.overall_misses,
        s.target_accuracy_score, s.avg_control_score, s.lift, s.target_rank, s.chance_rate,
        JSON.stringify(s.verdict),
        JSON.stringify(s.target_meta.source_url || ""),
        JSON.stringify(s.target_meta.author || ""),
        JSON.stringify(s.target_meta.license || ""),
      ];
      lines.push(row.join(","));
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=rv-history.csv");
    return res.send(lines.join("\n"));
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=rv-history.json");
  res.send(JSON.stringify(sessions, null, 2));
});

router.get("/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  res.json(session);
});

router.delete("/:id", (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

router.delete("/", (req, res) => {
  deleteAllSessions();
  res.json({ ok: true });
});

export default router;
