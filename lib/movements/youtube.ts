/**
 * YouTube URL → embeddable URL.
 *
 * The library stores YouTube Shorts WATCH URLs (https://www.youtube.com/shorts/{id}),
 * which do NOT embed. This extracts the 11-char video id from the shapes we might
 * see and builds the embed URL. Returns null for null / malformed / unextractable
 * input so callers render NO video slot rather than a broken player or empty frame.
 */

/** YouTube video ids are exactly 11 chars of [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractYoutubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = parts[0] ?? null; // youtu.be/{id}
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v") {
      candidate = parts[1] ?? null; // /shorts/{id}, /embed/{id}, /v/{id}
    } else if (u.pathname === "/watch") {
      candidate = u.searchParams.get("v"); // /watch?v={id}
    }
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  const id = extractYoutubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
