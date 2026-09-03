"use client";

import { useEffect, useRef, useState } from "react";

const MIN_SPEED = 50;
const MAX_SPEED = 200;
const SPEED_STEP = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PopoverKind = "speed" | "volume" | null;

// Shared exercise audio player (student, coach, admin). Fully custom
// rather than <audio controls> — the native control bar carries its own
// built-in playback-rate menu (fixed 0.5/0.75/1/1.25/1.5 presets, no way
// to remove or hook into it), which fought visibly with an earlier
// version's separate speed slider (two independent, out-of-sync sources
// of truth for the same audio element). Building play/seek/speed/volume
// ourselves means there's exactly one. Uses Tailwind arbitrary var()
// classes rather than a CSS module so it renders correctly under any
// route group's theme root, same reasoning as
// components/assign-exercise-panel.tsx.
export default function ExercisePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const speedBtnRef = useRef<HTMLButtonElement>(null);
  const volumeBtnRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [volume, setVolume] = useState(100);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<PopoverKind>(null);
  // Popovers render position: fixed, computed from the trigger button's
  // on-screen position — the exercise list's rounded-corner container
  // clips overflow (student.module.css .exercisePanel), which cut off
  // any popover attached with a normal absolute/relative position for
  // exercises near the bottom of the list.
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!openPopover) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openPopover]);

  // popoverPos is only ever computed once, at the moment the popover
  // opens — scrolling the page afterward left it visually pinned at
  // that original spot instead of following its trigger button,
  // confirmed live to end up overlapping unrelated content further up
  // the page. Closing on scroll/resize is simpler and more robust than
  // continuously recomputing position (and matches how a lightweight
  // popover like this is expected to behave elsewhere). Capture phase
  // on window so a scroll inside any nested scrollable ancestor is
  // caught too, not just window-level scrolling.
  useEffect(() => {
    if (!openPopover) return;
    function handleScrollOrResize() {
      setOpenPopover(null);
    }
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openPopover]);

  function togglePopover(kind: PopoverKind, btnRef: React.RefObject<HTMLButtonElement | null>) {
    if (openPopover === kind) {
      setOpenPopover(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPopoverPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpenPopover(kind);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      // play() returns a promise that can reject (autoplay policy, a
      // decode failure) without the <audio> element's own error event
      // also firing in every browser — unhandled, that's a click that
      // silently does nothing, no error shown, indistinguishable from
      // "exercises just don't play" from the student's side.
      audio.play().catch(() => {
        setPlaybackError("Couldn't play this recording — try reloading the page.");
      });
    }
  }

  // The <audio> element's own error event carries no HTTP status — a
  // student reporting "it just doesn't play" previously had nothing more
  // specific to go on, and neither did whoever they told. A plain fetch
  // of the same same-origin, cookie-authed URL surfaces the actual
  // status (403 = not really assigned this one, 404/500 = the Drive
  // file behind it is missing or the streaming proxy failed) right in
  // the player instead of requiring anyone to open devtools.
  async function handleAudioError() {
    try {
      const res = await fetch(src);
      setPlaybackError(
        res.ok
          ? "Couldn't play this recording — try reloading the page."
          : `Couldn't play this recording (error ${res.status}). Let your coach or admin know.`,
      );
    } catch {
      setPlaybackError("Couldn't play this recording — check your connection and try again.");
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

  function handleVolumeChange(value: number) {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value / 100;
  }

  return (
    <div ref={containerRef} className="relative">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => {
          setPlaying(true);
          setPlaybackError(null);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onError={handleAudioError}
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
          ref={volumeBtnRef}
          type="button"
          onClick={() => togglePopover("volume", volumeBtnRef)}
          aria-label="Volume"
          aria-expanded={openPopover === "volume"}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"
        >
          {volume === 0 ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 6h3l4-3.5v11L5 10H2z" />
              <path d="M10.5 5.5l4 4M14.5 5.5l-4 4" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 6h3l4-3.5v11L5 10H2z" />
              <path
                d="M11 5.5a4 4 0 0 1 0 5"
                stroke="currentColor"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <button
          ref={speedBtnRef}
          type="button"
          onClick={() => togglePopover("speed", speedBtnRef)}
          aria-label="Playback speed"
          aria-expanded={openPopover === "speed"}
          className="flex-none rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text)]"
        >
          {speed / 100}×
        </button>
      </div>
      {playbackError && <p className="mt-1 text-xs text-[var(--coral)]">{playbackError}</p>}
      {openPopover === "speed" && (
        <div
          className="fixed z-10 flex w-48 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg"
          style={{ top: popoverPos.top, right: popoverPos.right }}
        >
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={SPEED_STEP}
            value={speed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            style={{ accentColor: "var(--gold)" }}
            className="min-w-0 flex-1"
            aria-label="Playback speed slider"
          />
          <span className="w-10 flex-none text-right text-xs text-[var(--text-muted)]">{speed}%</span>
        </div>
      )}
      {openPopover === "volume" && (
        <div
          className="fixed z-10 flex w-40 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg"
          style={{ top: popoverPos.top, right: popoverPos.right }}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            style={{ accentColor: "var(--gold)" }}
            className="min-w-0 flex-1"
            aria-label="Volume slider"
          />
          <span className="w-9 flex-none text-right text-xs text-[var(--text-muted)]">{volume}%</span>
        </div>
      )}
    </div>
  );
}
