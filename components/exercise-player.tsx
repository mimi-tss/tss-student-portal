"use client";

import { useRef, useState } from "react";

const MIN_SPEED = 50;
const MAX_SPEED = 200;
const STEP = 10;

// Shared exercise audio player (student, coach, admin) — the browser's
// native <audio controls> playback-rate menu only offers a few fixed
// presets (0.5x/1x/1.5x/2x in most browsers), not the 10%-increment
// slider that was actually asked for, so speed is pulled out into its
// own range input driving the underlying element's playbackRate
// directly. Uses Tailwind arbitrary var() classes rather than a CSS
// module so it renders correctly under any route group's theme root,
// same reasoning as components/assign-exercise-panel.tsx.
export default function ExercisePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(100);

  function handleSpeedChange(value: number) {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value / 100;
  }

  return (
    <div>
      <audio
        ref={audioRef}
        controls
        controlsList="nodownload"
        src={src}
        style={{ width: "100%" }}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">Speed</span>
        <input
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={STEP}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ accentColor: "var(--gold)" }}
          className="flex-1"
          aria-label="Playback speed"
        />
        <span className="w-9 text-right text-xs text-[var(--text-muted)]">{speed}%</span>
      </div>
    </div>
  );
}
