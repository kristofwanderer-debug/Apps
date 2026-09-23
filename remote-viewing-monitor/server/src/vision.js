// All Claude vision calls: candidate screening, objective image description,
// and blind grading of a viewer's impressions/sketches against one image.
// Every grading call is given only an image + its description + the raw
// impressions - never a label saying whether it's the target or a control.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function apiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  return key;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  // Prefer object parse, fall back to array parse if the object braces
  // aren't found but array brackets are (some prompts ask for arrays).
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    return JSON.parse(raw.slice(arrStart, arrEnd + 1));
  }
  throw new Error("Could not find JSON in model response: " + text.slice(0, 300));
}

async function callClaude({ system, content, maxTokens = 1500 }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("\n") || "";
  return text;
}

function imageBlock(base64, mime) {
  return { type: "image", source: { type: "base64", media_type: mime, data: base64 } };
}

// Screens a single candidate image and, if accepted, also produces the
// objective description used later for grading (so we never re-fetch/re-run
// vision on the same image twice).
export async function analyzeCandidateImage({ base64, mime, role, targetSubjectTag }) {
  const system = `You are screening and objectively describing a photograph for a remote-viewing practice app. Respond with ONLY a single JSON object, no prose, no markdown fences.`;

  const similarityInstruction = role === "control" && targetSubjectTag
    ? `The session's TARGET image has this main subject/setting: "${targetSubjectTag}". Set "is_similar_to_target" to true if this candidate's main subject or setting is similar enough that a viewer could confuse them (e.g. both are beach/water scenes, both are city skylines, both are single-portrait photos, both are forest interiors). Set it false if they are clearly distinguishable categories.`
    : `Set "is_similar_to_target" to false (not applicable).`;

  const prompt = `Analyze the attached image and return this exact JSON shape:
{
  "is_photo": boolean,            // false if this is a diagram, logo, map, chart, flag, coat of arms, screenshot, scanned document/text page, or otherwise not a genuine photograph
  "is_text_heavy": boolean,       // true if a large portion of the frame is dominated by text/labels
  "is_disturbing": boolean,       // true if graphic, violent, sexual, gory, or otherwise distressing content
  "short_subject_tag": string,    // 3-8 words naming the main subject AND setting, e.g. "lighthouse on rocky coastline"
  "is_similar_to_target": boolean,
  "description": string           // 4-8 sentences, objective and structured: main subjects, colors, shapes/forms, textures/materials, setting (indoor/outdoor/natural/man-made), spatial layout, notable atmosphere. No speculation about meaning, only what is visibly present.
}
${similarityInstruction}`;

  const text = await callClaude({
    system,
    content: [{ type: "text", text: prompt }, imageBlock(base64, mime)],
    maxTokens: 900,
  });
  return extractJson(text);
}

// Blind grading: this function is never told whether `description`/`imageBase64`
// belongs to the target or a control. It grades the viewer's logged
// impressions and sketches against this one image using a fixed rubric.
export async function gradeSessionAgainstImage({ imageBase64, imageMime, description, impressions, sketches }) {
  const system = `You are a strict, fair judge for a remote-viewing practice exercise. You are shown ONE reference image and a list of impressions a viewer logged before seeing any image. You do not know and must not assume whether this image is "the target" or a "control" - grade it purely on its own merits against the impressions given. Respond with ONLY a single JSON object, no prose, no markdown fences.`;

  const impressionsList = impressions
    .map((imp, i) => `${i}. [Stage ${imp.stage}] "${imp.text}"`)
    .join("\n");

  const prompt = `REFERENCE IMAGE DESCRIPTION (for your own cross-check; the attached image is authoritative):
${description}

VIEWER'S LOGGED IMPRESSIONS (in order, each independent, given BEFORE they saw any image):
${impressionsList || "(no text/voice impressions were logged)"}

Grade each impression against the attached image. Be strict and fair: vague or generic impressions that would plausibly fit almost any photograph (e.g. "I sense energy", "there's a color", "something natural") must NOT be scored as strong hits - label those MISS or at most PARTIAL only if there is a genuinely specific, non-generic match. A HIT requires a specific, correct correspondence (a specific object, color, material, shape, spatial relationship, or setting that matches). A PARTIAL is a loose, general, or partially-correct correspondence. A MISS has no meaningful correspondence.

Return this exact JSON shape:
{
  "per_impression": [
    { "index": 0, "verdict": "HIT" | "PARTIAL" | "MISS", "reason": "one sentence" }
    // one entry per impression, in the same order and using the same index
  ],
  "sketch_notes": [
    { "stage": "1" | "3", "verdict": "HIT" | "PARTIAL" | "MISS", "reason": "one sentence comparing the sketch's major shapes/composition/layout to the image" }
    // one entry per attached sketch image, in the order the sketches were attached
  ],
  "notable_elements_not_mentioned": ["short phrase", "..."]  // 2-5 clearly visible, specific elements of this image that none of the impressions captured
}`;

  const content = [{ type: "text", text: prompt }, imageBlock(imageBase64, imageMime)];
  for (const sk of sketches) {
    content.push({ type: "text", text: `Sketch from Stage ${sk.stage}:` });
    content.push(imageBlock(sk.base64, sk.mime || "image/png"));
  }

  const text = await callClaude({ system, content, maxTokens: 1800 });
  const parsed = extractJson(text);

  const perImpression = parsed.per_impression || [];
  const hits = perImpression.filter((p) => p.verdict === "HIT").length;
  const partials = perImpression.filter((p) => p.verdict === "PARTIAL").length;
  const misses = perImpression.filter((p) => p.verdict === "MISS").length;
  const total = perImpression.length || 1;
  const accuracy_score = (hits + 0.5 * partials) / total;

  return {
    per_impression: perImpression,
    sketch_notes: parsed.sketch_notes || [],
    notable_elements_not_mentioned: parsed.notable_elements_not_mentioned || [],
    hits,
    partials,
    misses,
    total_impressions: perImpression.length,
    accuracy_score,
  };
}
