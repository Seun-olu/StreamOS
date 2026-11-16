"use client";

import { useEffect, useRef, useState } from "react";
import { saveProgress } from "@/app/actions";

/**
 * HTML5 player that resumes from `start` and saves the position every 10 s of
 * playback and on pause, end and tab hide. The server keeps the latest write.
 */
export function Player({ src, start, titleId, episodeId, label }: {
  src: string; start: number; titleId: string; episodeId: string | null; label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(start);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const save = () => {
      if (!Number.isFinite(v.currentTime) || Math.abs(v.currentTime - lastSaved.current) < 1) return;
      lastSaved.current = v.currentTime;
      const position = v.currentTime;
      void saveProgress({ titleId, episodeId, position, duration: Number.isFinite(v.duration) ? v.duration : null })
        .then((r) => r.ok && setSaved(Math.floor(position)));
    };
    const onLoaded = () => { if (start > 0 && start < v.duration) v.currentTime = start; };
    const onTime = () => { if (Math.abs(v.currentTime - lastSaved.current) >= 10) save(); };
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", save);
    v.addEventListener("ended", save);
    document.addEventListener("visibilitychange", onHide);
    if (v.readyState >= 1) onLoaded();
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", save);
      v.removeEventListener("ended", save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [start, titleId, episodeId]);

  return (
    <div>
      <video ref={ref} src={src} controls playsInline preload="metadata" aria-label={label}
        className="aspect-video w-full rounded-lg bg-black" />
      <p className="mt-2 h-5 text-xs text-zinc-500" role="status" data-testid="progress-status">
        {saved !== null ? `Progress saved at ${Math.floor(saved / 60)}:${String(saved % 60).padStart(2, "0")}` : start > 0 ? `Resuming from ${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}` : ""}
      </p>
    </div>
  );
}
