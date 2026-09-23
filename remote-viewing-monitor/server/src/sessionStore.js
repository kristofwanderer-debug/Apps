// Server-side-only store for in-progress sessions. Holds raw image bytes
// (base64) transiently, purely in memory - never persisted to disk and
// never sent to the browser until /finish returns public source URLs.
// Entries are deleted as soon as a session finishes or is aborted.

const sessions = new Map();

export function createSession(session) {
  sessions.set(session.id, session);
  return session;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function deleteSession(id) {
  sessions.delete(id);
}

// Safety net: if a viewer abandons a session mid-listening-phase, don't let
// its image bytes sit in memory forever.
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.createdAtMs > MAX_AGE_MS) sessions.delete(id);
  }
}, 30 * 60 * 1000).unref();

export default sessions;
