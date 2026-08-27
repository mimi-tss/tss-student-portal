"use client";

import { useEffect, useRef, useState } from "react";

const MIN_SPEED = 50;
const MAX_SPEED = 200;
const STEP = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Shared exercise audio player (student, coach, admin). Fully custom
// rather than <audio controls> — the native control bar carries its own
// built-in playback-rate menu (fixed 0.5/0.75/1/1.25/1.5 presets, no way
// to remove or hook into it), which fought visibly with an earlier
// version's separate speed slider (two independent, out-of-sync sources
// of truth for the same audio element). Building play/seek/speed
// ourselves means there's exactly one. Uses Tailwind arbitrary var()
// classes rather than a CSS module so it renders correctly under any
// route group's theme root, same reasoning as
// components/assign-exercise-panel.tsx.
export default function ExercisePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [speedOpen, setSpeedOpen] = useState(false);

  useEffect(() => {
    if (!speedOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSpeedOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [speedOpen]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function handleSeek(value: number) {
    setCurrentTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  }

  function handleSpeedChange(value: number) {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value / 100;
  }

  return (
    <div ref={containerRef} className="relative">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--gold)] text-[var(--gold-text)]"
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="0" width="3" height="10" />
              <rect x="6" y="0" width="3" height="10" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 0 L9 5 L1 10 Z" />
            </svg>
          )}
        </button>
        <span className="w-9 flex-none text-right text-xs text-[var(--text-muted)]">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => handleSeek(Number(e.target.value))}
          style={{ accentColor: "var(--gold)" }}
          className="min-w-0 flex-1"
          aria-label="Seek"
        />
        <span className="w-9 flex-none text-xs text-[var(--text-muted)]">{formatTime(duration)}</span>
        <button
          type="button"
          onClick={() => setSpeedOpen((o) => !o)}
          aria-label="Playback speed"
          aria-expanded={speedOpen}
          className="flex-none rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text)]"
        >
          {speed / 100}×
        </button>
      </div>
      {speedOpen && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 flex w-48 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg">
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={STEP}
            value={speed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            style={{ accentColor: "var(--gold)" }}
            className="min-w-0 flex-1"
            aria-label="Playback speed slider"
          />
          <span className="w-10 flex-none text-right text-xs text-[var(--text-muted)]">{speed}%</span>
        </div>
      )}
    </div>
  );
}
