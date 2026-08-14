import { describe, it, expect } from "vitest";
import { youtubeEmbedUrl, extractYoutubeId } from "./youtube";

const ID = "00n38vocFDo"; // 11 chars, from the real library

describe("youtubeEmbedUrl", () => {
  it("embeds a Shorts watch URL (the library's format)", () => {
    expect(youtubeEmbedUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(
      `https://www.youtube.com/embed/${ID}`,
    );
  });

  it("embeds standard watch, youtu.be, embed, and already-embed URLs", () => {
    expect(youtubeEmbedUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `https://www.youtube.com/embed/${ID}`,
    );
    expect(youtubeEmbedUrl(`https://youtu.be/${ID}`)).toBe(
      `https://www.youtube.com/embed/${ID}`,
    );
    expect(youtubeEmbedUrl(`https://www.youtube.com/embed/${ID}`)).toBe(
      `https://www.youtube.com/embed/${ID}`,
    );
    // Extra query params on a shorts URL still resolve.
    expect(youtubeEmbedUrl(`https://www.youtube.com/shorts/${ID}?feature=share`)).toBe(
      `https://www.youtube.com/embed/${ID}`,
    );
  });

  it("returns null for null / empty / malformed / non-YouTube / bad id", () => {
    expect(youtubeEmbedUrl(null)).toBeNull();
    expect(youtubeEmbedUrl(undefined)).toBeNull();
    expect(youtubeEmbedUrl("")).toBeNull();
    expect(youtubeEmbedUrl("TODO - curated link only")).toBeNull();
    expect(youtubeEmbedUrl("https://vimeo.com/12345")).toBeNull();
    expect(youtubeEmbedUrl("https://www.youtube.com/shorts/")).toBeNull();
    expect(youtubeEmbedUrl("https://www.youtube.com/shorts/too-short")).toBeNull();
    expect(youtubeEmbedUrl("not a url")).toBeNull();
  });

  it("extractYoutubeId returns the bare id or null", () => {
    expect(extractYoutubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(extractYoutubeId("https://vimeo.com/1")).toBeNull();
  });
});
