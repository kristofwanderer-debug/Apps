// Fetches candidate images from public sources: Wikimedia Commons (primary)
// and Unsplash (fallback). Returns raw candidate metadata; content/quality
// screening happens separately in vision.js so it can use the vision model.

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const MIN_WIDTH = 800;
const ACCEPTED_MIME = new Set(["image/jpeg", "image/png"]);

function stripHtml(str) {
  if (!str) return "";
  return String(str).replace(/<[^>]*>/g, "").trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "RemoteViewingMonitor/1.0 (educational practice app)" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

// Fetches one random candidate from Wikimedia Commons File namespace.
// Returns null if the candidate doesn't meet basic type/size/metadata
// requirements (caller should just try again).
export async function fetchWikimediaCandidate() {
  const params = new URLSearchParams({
    action: "query",
    generator: "random",
    grnnamespace: "6",
    grnlimit: "1",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    format: "json",
    formatversion: "2",
  });
  const data = await fetchJson(`${WIKIMEDIA_API}?${params.toString()}`);
  const pages = data?.query?.pages;
  if (!pages || !pages.length) return null;
  const page = pages[0];
  const info = page.imageinfo?.[0];
  if (!info) return null;

  const mime = info.mime;
  if (!ACCEPTED_MIME.has(mime)) return null;
  if (!info.width || info.width < MIN_WIDTH) return null;

  const meta = info.extmetadata || {};
  const author = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value);
  const license = stripHtml(meta.LicenseShortName?.value);
  if (!author || !license) return null;

  // Filter out obvious non-photo content by title keywords (diagrams, maps,
  // logos, flags, scans, screenshots, charts). Not foolproof - the vision
  // model does the real screening - but avoids wasting a vision call on
  // clearly-non-photographic files most of the time.
  const title = (page.title || "").toLowerCase();
  const bannedWords = ["logo", "flag of", "map of", "diagram", "chart", "screenshot", "icon", "coat of arms", "seal of", "graph of", "scan of", "document", ".svg", ".pdf"];
  if (bannedWords.some((w) => title.includes(w))) return null;

  return {
    source: "wikimedia",
    imageUrl: info.url,
    width: info.width,
    height: info.height,
    mime,
    author,
    license,
    sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    title: page.title,
  };
}

export async function fetchUnsplashCandidate(accessKey) {
  if (!accessKey) return null;
  const res = await fetch("https://api.unsplash.com/photos/random?content_filter=high&orientation=landscape", {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.urls?.regular) return null;
  return {
    source: "unsplash",
    imageUrl: data.urls.regular,
    width: data.width,
    height: data.height,
    mime: "image/jpeg",
    author: data.user?.name || "Unknown",
    license: "Unsplash License",
    sourceUrl: data.links?.html || "https://unsplash.com",
    title: data.alt_description || "Untitled",
  };
}

export async function downloadImageAsBase64(imageUrl) {
  const res = await fetch(imageUrl, { headers: { "User-Agent": "RemoteViewingMonitor/1.0 (educational practice app)" } });
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mime: contentType.split(";")[0].trim() };
}

// Tries Wikimedia up to `wikimediaAttempts` times, then falls back to
// Unsplash if configured. Returns a raw (unscreened) candidate or null.
export async function fetchRawCandidate({ unsplashAccessKey, wikimediaAttempts = 6 } = {}) {
  for (let i = 0; i < wikimediaAttempts; i++) {
    try {
      const candidate = await fetchWikimediaCandidate();
      if (candidate) return candidate;
    } catch {
      // ignore and retry
    }
  }
  try {
    const fallback = await fetchUnsplashCandidate(unsplashAccessKey);
    if (fallback) return fallback;
  } catch {
    // ignore
  }
  return null;
}
