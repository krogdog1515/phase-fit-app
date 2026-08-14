"use client";

import { useState } from "react";

/**
 * Collapsible YouTube demo for a movement. Collapsed behind "Watch demo" — she's
 * mid-session, not browsing, so an auto-expanded player per movement makes the
 * page unusable on a phone. Renders NOTHING when embedUrl is null (a missing or
 * unparseable link must never show a broken player). Shorts are vertical (9:16),
 * so the frame is sized to that rather than letterboxed.
 */
export default function MovementVideo({
  embedUrl,
  onReportBroken,
}: {
  embedUrl: string | null;
  onReportBroken: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  if (!embedUrl) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pf-link text-sm"
      >
        ▶ Watch demo
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full max-w-[220px] aspect-[9/16] overflow-hidden rounded-lg bg-black">
        <iframe
          src={embedUrl}
          title="Movement demo"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="pf-link text-xs"
        >
          Hide demo
        </button>
        {reported ? (
          <span className="text-xs text-pf-text-muted">Thanks — we&apos;ll check it.</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              onReportBroken();
              setReported(true);
            }}
            className="text-xs text-pf-text-muted underline"
          >
            Video not working
          </button>
        )}
      </div>
    </div>
  );
}
