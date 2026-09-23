// All backend calls in one place. In local dev, Vite proxies /api to the
// server. In the packaged Android app there is no localhost, so
// VITE_API_BASE_URL is baked in at build time to point at the deployed
// backend (see .env.production / the build command in README).
const BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // some responses (csv export) aren't json - callers that need that use rawRequest
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function newSession(numControls) {
  return request("/api/session/new", { method: "POST", body: JSON.stringify({ numControls }) });
}

export function logImpression(sessionId, stage, text, inputMode) {
  return request(`/api/session/${sessionId}/impression`, {
    method: "POST",
    body: JSON.stringify({ stage, text, input_mode: inputMode }),
  });
}

export function logSketch(sessionId, stage, dataUrl) {
  return request(`/api/session/${sessionId}/sketch`, {
    method: "POST",
    body: JSON.stringify({ stage, dataUrl }),
  });
}

export function finishSession(sessionId) {
  return request(`/api/session/${sessionId}/finish`, { method: "POST" });
}

export function abortSession(sessionId) {
  return request(`/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
}

export function getHistory() {
  return request("/api/history");
}

export function getHistoryStats() {
  return request("/api/history/stats");
}

export function getHistorySession(id) {
  return request(`/api/history/${id}`);
}

export function deleteHistorySession(id) {
  return request(`/api/history/${id}`, { method: "DELETE" });
}

export function deleteAllHistory() {
  return request("/api/history", { method: "DELETE" });
}

export function exportHistoryUrl(format) {
  return `${BASE}/api/history/export?format=${format}`;
}
