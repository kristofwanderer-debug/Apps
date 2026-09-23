import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { fetchRawCandidate, downloadImageAsBase64 } from "../imageSources.js";
import { analyzeCandidateImage, gradeSessionAgainstImage } from "../vision.js";
import { createSession, getSession, deleteSession } from "../sessionStore.js";
import { insertSession } from "../db.js";

const router = Router();

function randomCoordinate() {
  const a = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const b = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${a}-${b}`;
}

async function acquireOneImage({ role, targetSubjectTag, rejectTagsCaseInsensitive, unsplashAccessKey, maxAttempts }) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = await fetchRawCandidate({ unsplashAccessKey });
    if (!candidate) continue;
    let bytes;
    try {
      bytes = await downloadImageAsBase64(candidate.imageUrl);
    } catch {
      continue;
    }
    let analysis;
    try {
      analysis = await analyzeCandidateImage({
        base64: bytes.base64,
        mime: bytes.mime,
        role,
        targetSubjectTag,
      });
    } catch {
      continue;
    }
    if (!analysis.is_photo) continue;
    if (analysis.is_text_heavy) continue;
    if (analysis.is_disturbing) continue;
    if (role === "control") {
      if (analysis.is_similar_to_target) continue;
      const tag = (analysis.short_subject_tag || "").trim().toLowerCase();
      if (rejectTagsCaseInsensitive?.some((t) => t === tag)) continue;
    }
    return {
      imageUrl: candidate.imageUrl,
      author: candidate.author,
      license: candidate.license,
      sourceUrl: candidate.sourceUrl,
      base64: bytes.base64,
      mime: bytes.mime,
      description: analysis.description,
      subjectTag: analysis.short_subject_tag,
    };
  }
  return null;
}

// POST /api/session/new  { numControls }
router.post("/new", async (req, res) => {
  try {
    let numControls = parseInt(req.body?.numControls, 10);
    if (!Number.isFinite(numControls)) numControls = 3;
    numControls = Math.min(5, Math.max(1, numControls));

    const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY;

    const target = await acquireOneImage({ role: "target", maxAttempts: 20, unsplashAccessKey });
    if (!target) {
      return res.status(502).json({ error: "Could not find a suitable target image after several attempts. Please try again." });
    }

    const controls = [];
    const acceptedTags = [];
    for (let i = 0; i < numControls; i++) {
      const control = await acquireOneImage({
        role: "control",
        targetSubjectTag: target.subjectTag,
        rejectTagsCaseInsensitive: acceptedTags,
        maxAttempts: 20,
        unsplashAccessKey,
      });
      if (!control) {
        return res.status(502).json({ error: "Could not find enough suitable control images after several attempts. Please try again." });
      }
      controls.push(control);
      acceptedTags.push((control.subjectTag || "").trim().toLowerCase());
    }

    const session = {
      id: uuidv4(),
      createdAtMs: Date.now(),
      createdAt: new Date().toISOString(),
      coordinate: randomCoordinate(),
      numControls,
      target,
      controls,
      impressions: [],
      sketches: [],
      status: "acquired",
    };
    createSession(session);

    res.json({ sessionId: session.id, coordinate: session.coordinate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to start session." });
  }
});

// POST /api/session/:id/impression  { stage, text, input_mode }
router.post("/:id/impression", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found or already ended." });
  const { stage, text, input_mode } = req.body || {};
  if (!stage || !text || !text.trim()) return res.status(400).json({ error: "stage and text are required." });
  session.impressions.push({
    stage: String(stage),
    text: String(text).trim(),
    input_mode: input_mode === "voice" ? "voice" : "text",
    timestamp: new Date().toISOString(),
  });
  res.json({ ok: true });
});

// POST /api/session/:id/sketch  { stage, dataUrl }
router.post("/:id/sketch", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found or already ended." });
  const { stage, dataUrl } = req.body || {};
  if (!stage || !dataUrl) return res.status(400).json({ error: "stage and dataUrl are required." });
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 image data URL." });
  session.sketches.push({
    stage: String(stage),
    mime: match[1],
    base64: match[2],
    timestamp: new Date().toISOString(),
  });
  res.json({ ok: true });
});

// DELETE /api/session/:id  - abort without grading/saving
router.delete("/:id", (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// POST /api/session/:id/finish - runs blind grading, persists history, returns
// the full analysis + reveal-safe image URLs, then deletes the in-memory
// session (including all image bytes).
router.post("/:id/finish", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found or already ended." });

  try {
    session.status = "analyzing";

    const allImages = [
      { role: "target", ...session.target },
      ...session.controls.map((c) => ({ role: "control", ...c })),
    ];
    // Shuffle processing order (the grader is never told the role either way).
    for (let i = allImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allImages[i], allImages[j]] = [allImages[j], allImages[i]];
    }

    const gradingByRole = { target: null, controls: [] };
    for (const img of allImages) {
      const grading = await gradeSessionAgainstImage({
        imageBase64: img.base64,
        imageMime: img.mime,
        description: img.description,
        impressions: session.impressions,
        sketches: session.sketches,
      });
      if (img.role === "target") {
        gradingByRole.target = { grading, meta: img };
      } else {
        gradingByRole.controls.push({ grading, meta: img });
      }
    }

    // Per-stage breakdown for the target only, derived from the same
    // per-impression verdicts using each impression's recorded stage.
    const stageBreakdown = { "1": { hits: 0, partials: 0, misses: 0 }, "2": { hits: 0, partials: 0, misses: 0 }, "3": { hits: 0, partials: 0, misses: 0 } };
    gradingByRole.target.grading.per_impression.forEach((p) => {
      const stage = session.impressions[p.index]?.stage;
      const bucket = stageBreakdown[stage];
      if (!bucket) return;
      if (p.verdict === "HIT") bucket.hits++;
      else if (p.verdict === "PARTIAL") bucket.partials++;
      else bucket.misses++;
    });

    const targetScore = gradingByRole.target.grading.accuracy_score;
    const controlScores = gradingByRole.controls.map((c) => c.grading.accuracy_score);
    const avgControlScore = controlScores.length ? controlScores.reduce((a, b) => a + b, 0) / controlScores.length : 0;
    const lift = targetScore - avgControlScore;

    const allScoresDesc = [targetScore, ...controlScores].slice().sort((a, b) => b - a);
    const targetRank = allScoresDesc.filter((s) => s > targetScore).length + 1;
    const n = session.numControls;
    const chanceRate = 1 / (n + 1);

    let verdict;
    if (targetRank === 1) verdict = "Target scored above all controls.";
    else if (targetRank === n + 1) verdict = "Target scored below all controls.";
    else verdict = "Target scored within the range of the controls, so this session is consistent with chance.";

    const analysis = {
      overall: {
        hits: gradingByRole.target.grading.hits,
        partials: gradingByRole.target.grading.partials,
        misses: gradingByRole.target.grading.misses,
        total_impressions: gradingByRole.target.grading.total_impressions,
      },
      stage_breakdown: stageBreakdown,
      per_impression: gradingByRole.target.grading.per_impression.map((p) => ({
        ...p,
        stage: session.impressions[p.index]?.stage,
        text: session.impressions[p.index]?.text,
        input_mode: session.impressions[p.index]?.input_mode,
        timestamp: session.impressions[p.index]?.timestamp,
      })),
      sketch_notes: gradingByRole.target.grading.sketch_notes,
      target_accuracy_score: targetScore,
      avg_control_score: avgControlScore,
      lift,
      target_rank: targetRank,
      num_images: n + 1,
      chance_rate: chanceRate,
      verdict,
      notable_missed: gradingByRole.target.grading.notable_elements_not_mentioned,
      controls: gradingByRole.controls.map((c) => ({
        accuracy_score: c.grading.accuracy_score,
        hits: c.grading.hits,
        partials: c.grading.partials,
        misses: c.grading.misses,
        imageUrl: c.meta.imageUrl,
        author: c.meta.author,
        license: c.meta.license,
        sourceUrl: c.meta.sourceUrl,
      })),
    };

    const reveal = {
      target: {
        imageUrl: session.target.imageUrl,
        author: session.target.author,
        license: session.target.license,
        sourceUrl: session.target.sourceUrl,
      },
    };

    // Persist permanent history record - never includes image bytes, only
    // public source links/credit/license.
    insertSession({
      id: session.id,
      created_at: session.createdAt,
      coordinate: session.coordinate,
      num_controls: n,
      overall_hits: analysis.overall.hits,
      overall_partials: analysis.overall.partials,
      overall_misses: analysis.overall.misses,
      stage_breakdown_json: JSON.stringify(stageBreakdown),
      target_accuracy_score: targetScore,
      avg_control_score: avgControlScore,
      lift,
      target_rank: targetRank,
      chance_rate: chanceRate,
      verdict,
      target_meta_json: JSON.stringify({
        source_url: session.target.sourceUrl,
        image_url: session.target.imageUrl,
        author: session.target.author,
        license: session.target.license,
      }),
      controls_meta_json: JSON.stringify(
        gradingByRole.controls.map((c) => ({
          source_url: c.meta.sourceUrl,
          image_url: c.meta.imageUrl,
          author: c.meta.author,
          license: c.meta.license,
          accuracy_score: c.grading.accuracy_score,
        }))
      ),
      impressions_json: JSON.stringify(session.impressions),
      sketches_json: JSON.stringify(session.sketches.map((s) => ({ stage: s.stage, timestamp: s.timestamp, data_url: `data:${s.mime};base64,${s.base64}` }))),
      grading_json: JSON.stringify(analysis),
      notable_missed_json: JSON.stringify(analysis.notable_missed),
    });

    // Session is over: drop all image bytes and the in-memory record.
    deleteSession(session.id);

    res.json({ coordinate: session.coordinate, analysis, reveal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to analyze session." });
  }
});

export default router;
