"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

/** A film served from this site (public/), played as it was delivered. */
export type VideoSource = {
  src: string;
  /** The dialog's name for screen readers. */
  title: string;
  /** The film's own size: the frame keeps its shape. */
  width: number;
  height: number;
  /** Colour of the film's first frame. The frame shows it while the film loads, so the start looks seamless. */
  firstFrame?: string;
};

type Handle = { open: () => void; warm: () => void };

/* Safari still names some of these with a prefix, and iPhone has no element fullscreen at all. */
type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
  webkitPresentationMode?: string;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** While the film plays, the controls fade out after this long without the pointer moving. */
const IDLE_MS = 2500;
/** Length of the closing fade. */
const CLOSE_MS = 240;

const noopSubscribe = () => () => {};
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
/** A browser that refuses a request (fullscreen, picture in picture) leaves things as they were. */
const settle = (p: unknown) => void Promise.resolve(p).catch(() => {});

type Caps = { fullscreen: boolean; pip: boolean; volume: boolean };
const NO_CAPS: Caps = { fullscreen: false, pip: false, volume: false };
let caps: Caps | null = null;
/** What this browser lets a page do with a video, worked out once on the client. */
function capabilities(): Caps {
  if (caps) return caps;
  const v = document.createElement("video") as WebkitVideo;
  const d = document as WebkitDocument;
  v.volume = 0.5;
  caps = {
    fullscreen: !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || v.webkitEnterFullscreen),
    pip: !!(document.pictureInPictureEnabled || v.webkitSupportsPresentationMode?.("picture-in-picture")),
    // iPhone leaves the volume to its hardware buttons: a page setting it changes nothing
    volume: v.volume === 0.5,
  };
  return caps;
}

let locked: { overflow: string; padding: string } | null = null;
function lockScroll() {
  if (locked) return;
  const html = document.documentElement;
  const body = document.body;
  const bar = window.innerWidth - html.clientWidth;
  locked = { overflow: html.style.overflow, padding: body.style.paddingRight };
  // the scrollbar goes and the body takes its width, so the page behind does not shift sideways
  // (keeping the scrollbar's gutter instead leaves a white strip beside the dark backdrop and the full-screen film)
  if (bar > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + bar}px`;
  html.style.overflow = "hidden";
}
function unlockScroll() {
  if (!locked) return;
  document.documentElement.style.overflow = locked.overflow;
  document.body.style.paddingRight = locked.padding;
  locked = null;
}

function clock(seconds: number) {
  const t = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const speedLabel = (r: number) => `${r}x`;

/**
 * A pill button that plays a film in a lightbox, the frame Apple uses for its product films: the page dims and
 * blurs, the film grows into a rounded frame and starts at once, with its own controls. The film is a file on this
 * site and plays as is.
 */
export function VideoButton({
  video,
  children,
  ...pill
}: { video: VideoSource; children: React.ReactNode } & Omit<React.ComponentProps<typeof PillButton>, "href" | "children" | "onClick">) {
  // the lightbox lives on <body>, so it is drawn once the page runs in a browser
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const lightbox = useRef<Handle>(null);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <PillButton
        {...pill}
        ref={button}
        type="button"
        aria-haspopup="dialog"
        onClick={() => lightbox.current?.open()}
        // a pointer on its way to the button: fetch the film's index so it starts sooner
        onPointerEnter={() => lightbox.current?.warm()}
        onFocus={() => lightbox.current?.warm()}
      >
        {children}
      </PillButton>
      {onClient ? createPortal(<VideoLightbox ref={lightbox} video={video} trigger={button} />, document.body) : null}
    </>
  );
}

function VideoLightbox({
  ref,
  video,
  trigger,
}: {
  ref: React.Ref<Handle>;
  video: VideoSource;
  trigger: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleTimer = useRef(0);
  const closeTimer = useRef(0);
  const pressedBackdrop = useRef(false);
  const pressClosedMenu = useRef(false);

  const can = useSyncExternalStore(noopSubscribe, capabilities, () => NO_CAPS);

  const [closing, setClosing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [idle, setIdle] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Shows the controls; while the film plays they fade out again after a moment without the pointer moving. */
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  /** Puts the lightbox on screen. Starting the film is up to the caller. */
  const show = useCallback(() => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    window.clearTimeout(closeTimer.current);
    lockScroll();
    d.showModal();
    setClosing(false);
    frameRef.current?.focus({ preventScroll: true });
    wake();
  }, [wake]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.error) {
      // a film that failed to load gets a fresh start
      setFailed(false);
      v.load();
    }
    if (v.ended) v.currentTime = 0;
    v.preload = "auto";
    // called straight from the click, so browsers allow sound; one that still refuses leaves the play button up
    void v.play().catch(() => {});
    setPlaying(!v.paused);
    if (v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setWaiting(true);
  }, []);

  const close = useCallback(() => {
    const d = dialogRef.current;
    if (!d?.open) return;
    setMenu(false);
    setClosing(true);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => d.close(), still ? 0 : CLOSE_MS);
  }, []);

  useImperativeHandle(ref, () => ({
    open: () => {
      show();
      play();
    },
    warm: () => {
      const v = videoRef.current;
      if (v && v.preload === "none") v.preload = "metadata";
    },
  }));

  const inPip = () => {
    const v = videoRef.current as WebkitVideo | null;
    return !!v && (document.pictureInPictureElement === v || v.webkitPresentationMode === "picture-in-picture");
  };

  // events React has no props for: fullscreen and picture in picture
  useEffect(() => {
    const v = videoRef.current as WebkitVideo | null;
    if (!v) return;
    const onFullscreen = () => {
      const d = document as WebkitDocument;
      setFullscreen((d.fullscreenElement ?? d.webkitFullscreenElement ?? null) === frameRef.current);
    };
    const pipOn = () => setPip(true);
    const pipOff = () => {
      setPip(false);
      // "back to tab" from the floating window: the film goes on in the frame
      if (!v.paused && !dialogRef.current?.open) show();
    };
    const onPresentation = () => (v.webkitPresentationMode === "picture-in-picture" ? pipOn() : pipOff());
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    v.addEventListener("enterpictureinpicture", pipOn);
    v.addEventListener("leavepictureinpicture", pipOff);
    v.addEventListener("webkitpresentationmodechanged", onPresentation);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      v.removeEventListener("enterpictureinpicture", pipOn);
      v.removeEventListener("leavepictureinpicture", pipOff);
      v.removeEventListener("webkitpresentationmodechanged", onPresentation);
    };
  }, [show]);

  // leaving the page with the lightbox open must not leave the next page unable to scroll
  useEffect(() => unlockScroll, []);

  const onClosed = () => {
    window.clearTimeout(idleTimer.current);
    setClosing(false);
    setMenu(false);
    unlockScroll();
    const d = document as WebkitDocument;
    if (d.fullscreenElement ?? d.webkitFullscreenElement) settle(d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    // a film moved to picture in picture plays on while the visitor reads the page
    if (!inPip()) videoRef.current?.pause();
    const active = document.activeElement;
    if (!active || active === document.body || dialogRef.current?.contains(active)) trigger.current?.focus({ preventScroll: true });
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else v.pause();
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = clamp(t, 0, v.duration);
    setTime(v.currentTime);
  };
  /** The seek bar's seeks: to the nearest keyframe while dragging (where the browser can), exact on release. */
  const scrubTo = useCallback((t: number, exact: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    if (!exact && typeof v.fastSeek === "function") v.fastSeek(t);
    else v.currentTime = t;
  }, []);
  const seekBy = (s: number) => seekTo((videoRef.current?.currentTime ?? 0) + s);

  const changeVolume = (x: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = clamp(x);
    v.muted = v.volume === 0;
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      if (v.volume === 0) v.volume = 0.6;
      v.muted = false;
    } else v.muted = true;
  };

  const toggleFullscreen = () => {
    const d = document as WebkitDocument;
    const f = frameRef.current as WebkitElement | null;
    const v = videoRef.current as WebkitVideo | null;
    if (d.fullscreenElement ?? d.webkitFullscreenElement) settle(d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else if (f && d.fullscreenEnabled) settle(f.requestFullscreen());
    else if (f?.webkitRequestFullscreen && d.webkitFullscreenEnabled) settle(f.webkitRequestFullscreen());
    // iPhone: the film opens in the phone's own full-screen player
    else v?.webkitEnterFullscreen?.();
  };

  const togglePip = () => {
    const v = videoRef.current as WebkitVideo | null;
    if (!v) return;
    if (inPip()) {
      if (document.pictureInPictureElement) settle(document.exitPictureInPicture());
      else v.webkitSetPresentationMode?.("inline");
    } else if (document.pictureInPictureEnabled) settle(v.requestPictureInPicture());
    else v.webkitSetPresentationMode?.("picture-in-picture");
  };

  const pickSpeed = (r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
    setMenu(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement;
    // the volume slider uses the arrow keys itself, and Space presses whatever button has focus
    const ownKeys = el.tagName === "INPUT";
    const onButton = el.tagName === "BUTTON";
    const v = videoRef.current;
    if (!v) return;
    wake();
    switch (e.key) {
      case " ":
        if (onButton || ownKeys) return;
        e.preventDefault();
        toggle();
        return;
      case "k":
      case "K":
        toggle();
        return;
      case "ArrowLeft":
      case "ArrowRight":
        if (ownKeys) return;
        e.preventDefault();
        seekBy(e.key === "ArrowLeft" ? -5 : 5);
        return;
      case "j":
      case "J":
        seekBy(-10);
        return;
      case "l":
      case "L":
        seekBy(10);
        return;
      case "ArrowUp":
      case "ArrowDown":
        if (ownKeys) return;
        e.preventDefault();
        changeVolume(v.volume + (e.key === "ArrowUp" ? 0.1 : -0.1));
        return;
      case "m":
      case "M":
        toggleMute();
        return;
      case "f":
      case "F":
        toggleFullscreen();
        return;
      case "Home":
        if (ownKeys) return;
        e.preventDefault();
        seekTo(0);
        return;
      case "End":
        if (ownKeys) return;
        e.preventDefault();
        seekTo(v.duration);
        return;
      default:
        // 0 to 9 jump to that tenth of the film
        if (!ownKeys && /^[0-9]$/.test(e.key)) seekTo((Number(e.key) / 10) * v.duration);
    }
  };

  const ratio = video.width / video.height;
  const chrome = !playing || !idle || menu || dragging || failed;
  const bigPlay = !playing && !waiting && !ended && !failed && !pip && !dragging;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the player's keyboard shortcuts; every one is also a button
    <dialog
      ref={dialogRef}
      aria-label={video.title}
      onCancel={(e) => {
        // Esc closes an open menu first, and the lightbox with a short fade
        e.preventDefault();
        if (menu) setMenu(false);
        else close();
      }}
      onClose={onClosed}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        pressClosedMenu.current = false;
        if (menu && !(e.target as Element).closest("[data-speed-menu]")) {
          setMenu(false);
          pressClosedMenu.current = true;
        }
      }}
      className={cn(
        "fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-white outline-none",
        "backdrop:bg-[rgb(4_12_10/0.86)] backdrop:backdrop-blur-xl backdrop:transition-opacity backdrop:duration-300 starting:open:backdrop:opacity-0 motion-reduce:backdrop:transition-none",
        closing && "backdrop:opacity-0",
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a click beside the film closes it; Esc and the close button do the same from the keyboard */}
      <div
        className="grid size-full touch-none place-items-center px-4 py-16 [--pad-y:8rem] sm:px-10 sm:py-20 sm:[--pad-y:10rem]"
        onPointerDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // only a press that started beside the film: a drag on the seek bar that ends out here is not a close
          if (pressedBackdrop.current && e.target === e.currentTarget) close();
          pressedBackdrop.current = false;
        }}
      >
        <div
          className={cn(
            "relative transition-[opacity,scale] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] starting:scale-[0.94] starting:opacity-0 motion-reduce:transition-none",
            closing && "scale-[0.97] opacity-0 duration-[240ms] ease-in",
          )}
          // never drawn wider than the film's own pixels, so a small film stays crisp instead of being stretched
          // (a higher-resolution source would simply allow a larger, still-sharp frame)
          style={{ width: `min(${video.width}px, 100%, calc((100dvh - var(--pad-y)) * ${ratio}))` }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close video"
            className="absolute right-0 bottom-[calc(100%+12px)] grid size-10 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur-xl transition-colors outline-none hover:bg-white/22 focus-visible:ring-2 focus-visible:ring-lime sm:size-11"
          >
            <X aria-hidden className="size-5" strokeWidth={2} />
          </button>

          <div
            ref={frameRef}
            tabIndex={-1}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") wake();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse" && playing && !menu && !dragging) {
                window.clearTimeout(idleTimer.current);
                setIdle(true);
              }
            }}
            className={cn(
              "@container relative isolate w-full overflow-hidden rounded-2xl bg-(--first) shadow-[0_40px_120px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/10 outline-none sm:rounded-[26px]",
              "[&:fullscreen]:rounded-none [&:fullscreen]:bg-black [&:fullscreen]:ring-0",
              !chrome && "cursor-none",
            )}
            style={{ aspectRatio: `${video.width} / ${video.height}`, ["--first" as string]: video.firstFrame ?? "#000" }}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the captions are part of the film's picture */}
            <video
              ref={videoRef}
              src={video.src}
              preload="none"
              playsInline
              className="absolute inset-0 size-full object-contain"
              onPlay={() => {
                setPlaying(true);
                setEnded(false);
                wake();
              }}
              onPause={() => {
                setPlaying(false);
                setWaiting(false);
              }}
              onPlaying={() => setWaiting(false)}
              onWaiting={() => setWaiting(true)}
              onCanPlay={() => setWaiting(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onSeeking={(e) => {
                setTime(e.currentTarget.currentTime);
                setEnded(false);
              }}
              onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              onVolumeChange={(e) => {
                setVolume(e.currentTarget.volume);
                setMuted(e.currentTarget.muted);
              }}
              onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
              onEnded={() => {
                setEnded(true);
                setPlaying(false);
                setWaiting(false);
                setIdle(false);
              }}
              onError={() => {
                setFailed(true);
                setPlaying(false);
                setWaiting(false);
              }}
            />

            {/* a click on the film plays or pauses it (a tap shows the controls); every action is also a button */}
            <div
              aria-hidden
              className="absolute inset-0 z-10"
              onPointerUp={(e) => {
                if (pressClosedMenu.current) {
                  pressClosedMenu.current = false;
                  return;
                }
                if (e.pointerType === "mouse") {
                  if (e.button === 0) toggle();
                  return;
                }
                if (playing && !idle) {
                  window.clearTimeout(idleTimer.current);
                  setIdle(true);
                } else wake();
              }}
              onDoubleClick={toggleFullscreen}
            />

            {bigPlay ? (
              <button
                type="button"
                onClick={toggle}
                aria-label="Play"
                className="absolute top-1/2 left-1/2 z-20 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgb(16_16_18/0.62)] text-white ring-1 ring-white/15 backdrop-blur-xl transition-[scale,background-color] duration-200 outline-none hover:scale-105 hover:bg-[rgb(16_16_18/0.74)] focus-visible:ring-2 focus-visible:ring-lime @md:size-[76px]"
              >
                <Play aria-hidden className="ml-1 size-6 fill-current @md:size-8" strokeWidth={1.5} />
              </button>
            ) : null}

            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 left-1/2 z-20 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgb(16_16_18/0.62)] ring-1 ring-white/15 backdrop-blur-xl transition-opacity duration-200 @md:size-[68px]",
                waiting && !failed && !pip ? "opacity-100 delay-150" : "opacity-0",
              )}
            >
              <span className="size-7 animate-spin rounded-full border-[2.5px] border-white/25 border-t-white @md:size-8" />
            </div>

            {failed ? (
              <div role="alert" className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-6 text-center">
                <div className="flex max-w-xs flex-col items-center gap-3">
                  <p className="m-0 text-[15px] leading-snug text-white">The video could not play. Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={play}
                    className="inline-flex h-9 items-center rounded-full bg-white px-5 text-[14px] font-medium text-pine transition-colors outline-none hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-lime"
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : null}

            {pip ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-[rgb(10_14_12/0.92)] p-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <PictureInPicture2 aria-hidden className="size-8 text-white/70" strokeWidth={1.5} />
                  <p className="m-0 text-[15px] text-white/85">Playing in picture in picture</p>
                  <button
                    type="button"
                    onClick={togglePip}
                    className="inline-flex h-9 items-center rounded-full bg-white/12 px-5 text-[14px] font-medium text-white ring-1 ring-white/15 transition-colors outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-lime"
                  >
                    Play here
                  </button>
                </div>
              </div>
            ) : null}

            <div
              className={cn(
                "absolute inset-x-2 bottom-2 z-30 flex h-11 items-center gap-0.5 rounded-full bg-[rgb(16_16_18/0.72)] px-1 text-white shadow-[0_8px_30px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 transition-[opacity,translate] duration-300",
                "@md:inset-x-3 @md:bottom-3 @lg:inset-x-4 @lg:bottom-4 @lg:h-[52px] @lg:gap-1 @lg:px-2",
                chrome
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1.5 opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:translate-y-0 has-[:focus-visible]:opacity-100",
              )}
            >
              <IconButton label={ended ? "Replay" : playing ? "Pause" : "Play"} onClick={toggle}>
                {ended ? (
                  <RotateCcw aria-hidden strokeWidth={2} />
                ) : playing ? (
                  <Pause aria-hidden className="fill-current" strokeWidth={1.5} />
                ) : (
                  <Play aria-hidden className="ml-0.5 fill-current" strokeWidth={1.5} />
                )}
              </IconButton>
              <IconButton label="Back 10 seconds" onClick={() => seekBy(-10)} className="hidden @md:grid">
                <Skip back />
              </IconButton>
              <IconButton label="Forward 10 seconds" onClick={() => seekBy(10)} className="hidden @md:grid">
                <Skip />
              </IconButton>

              <span className="shrink-0 px-1.5 text-[12px] font-medium text-white/90 tabular-nums @lg:text-[13px]">{clock(time)}</span>
              <Scrubber video={videoRef} time={time} duration={duration} playing={playing} onSeek={scrubTo} onDrag={setDragging} />
              <span className="hidden shrink-0 px-1.5 text-[12px] font-medium text-white/70 tabular-nums @sm:inline @lg:text-[13px]">
                {clock(duration)}
              </span>

              <div className="group/vol flex shrink-0 items-center">
                <IconButton label={muted || volume === 0 ? "Unmute" : "Mute"} onClick={toggleMute}>
                  <VolumeIcon aria-hidden strokeWidth={1.8} />
                </IconButton>
                {can.volume ? (
                  <div className="hidden w-0 items-center overflow-hidden opacity-0 transition-[width,opacity] duration-200 group-focus-within/vol:w-[84px] group-focus-within/vol:opacity-100 group-hover/vol:w-[84px] group-hover/vol:opacity-100 @xl:flex">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={(e) => changeVolume(Number(e.target.value))}
                      aria-label="Volume"
                      className="mx-2 h-1 w-[68px] cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lime/80 [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                      style={{
                        background: `linear-gradient(to right, #fff ${(muted ? 0 : volume) * 100}%, rgb(255 255 255 / 0.25) ${(muted ? 0 : volume) * 100}%)`,
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <SpeedMenu rate={rate} open={menu} onOpen={setMenu} onPick={pickSpeed} />
              {can.pip ? (
                <IconButton label={pip ? "Exit picture in picture" : "Picture in picture"} onClick={togglePip} className="hidden @xl:grid">
                  <PictureInPicture2 aria-hidden strokeWidth={1.8} />
                </IconButton>
              ) : null}
              {can.fullscreen ? (
                <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize aria-hidden strokeWidth={1.8} /> : <Maximize aria-hidden strokeWidth={1.8} />}
                </IconButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-white/90 transition-colors outline-none hover:bg-white/12 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/80 @lg:size-10 [&_svg]:size-[19px] @lg:[&_svg]:size-5",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The circular arrow with "10" inside, for the 10-second jumps. */
function Skip({ back = false }: { back?: boolean }) {
  const Icon = back ? RotateCcw : RotateCw;
  return (
    <span className="relative grid place-items-center">
      <Icon aria-hidden strokeWidth={1.8} />
      <span aria-hidden className="absolute pt-px text-[7.5px] leading-none font-semibold">
        10
      </span>
    </span>
  );
}

/** The seek bar: played part, buffered part, a knob, and the time under the pointer. Drag it or click anywhere on it. */
function Scrubber({
  video,
  time,
  duration,
  playing,
  onSeek,
  onDrag,
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  time: number;
  duration: number;
  playing: boolean;
  onSeek: (seconds: number, exact: boolean) => void;
  onDrag: (on: boolean) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const buffer = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const lastSeek = useRef(0);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);

  const paint = useCallback((p: number) => {
    if (fill.current) fill.current.style.transform = `scaleX(${p})`;
    if (knob.current) knob.current.style.left = `${p * 100}%`;
  }, []);

  // paused: the bar follows seeks
  useEffect(() => {
    if (!playing && !drag) paint(duration ? clamp(time / duration) : 0);
  }, [time, duration, playing, drag, paint]);

  // playing: the bar moves every frame (the time updates alone would move it in steps)
  useEffect(() => {
    const v = video.current;
    if (!v || !playing || drag || !duration) return;
    let raf = 0;
    const tick = () => {
      paint(clamp(v.currentTime / duration));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, playing, drag, duration, paint]);

  // how much is downloaded ahead of the playhead
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const draw = () => {
      const d = v.duration;
      if (!buffer.current || !Number.isFinite(d) || d <= 0) return;
      let end = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) end = v.buffered.end(i);
      }
      buffer.current.style.transform = `scaleX(${clamp(end / d)})`;
    };
    draw();
    v.addEventListener("progress", draw);
    v.addEventListener("timeupdate", draw);
    v.addEventListener("seeked", draw);
    return () => {
      v.removeEventListener("progress", draw);
      v.removeEventListener("timeupdate", draw);
      v.removeEventListener("seeked", draw);
    };
  }, [video]);

  const at = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    return r && r.width ? clamp((clientX - r.left) / r.width) : 0;
  };
  const seek = (p: number, exact: boolean) => {
    if (!duration) return;
    const now = performance.now();
    // while dragging, a seek at most every 80 ms; the exact spot is set on release
    if (!exact && now - lastSeek.current < 80) return;
    lastSeek.current = now;
    onSeek(p * duration, exact);
  };
  const end = (on: boolean) => {
    setDrag(on);
    onDrag(on);
  };

  const big = drag || hover !== null;
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${clock(time)} of ${clock(duration)}`}
      className="group/seek relative flex h-8 min-w-0 flex-1 cursor-pointer touch-none items-center outline-none"
      onPointerDown={(e) => {
        if (e.button !== 0 || !duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        end(true);
        const p = at(e.clientX);
        paint(p);
        setHover(p);
        seek(p, false);
      }}
      onPointerMove={(e) => {
        const p = at(e.clientX);
        if (drag) {
          paint(p);
          seek(p, false);
        }
        if (drag || e.pointerType === "mouse") setHover(p);
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        const p = at(e.clientX);
        paint(p);
        seek(p, true);
        end(false);
        if (e.pointerType !== "mouse") setHover(null);
      }}
      onPointerCancel={() => {
        end(false);
        setHover(null);
      }}
      onPointerLeave={() => {
        if (!drag) setHover(null);
      }}
    >
      <div
        className={cn(
          "relative h-[5px] w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-focus-visible/seek:h-[7px]",
          big && "h-[7px]",
        )}
      >
        <div ref={buffer} className="absolute inset-0 origin-left bg-white/25" style={{ transform: "scaleX(0)" }} />
        <div ref={fill} className="absolute inset-0 origin-left bg-lime" style={{ transform: "scaleX(0)" }} />
      </div>
      <div
        ref={knob}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition-[scale] duration-150 group-focus-visible/seek:scale-100 group-focus-visible/seek:ring-2 group-focus-visible/seek:ring-lime",
          big ? "scale-100" : "scale-0",
        )}
        style={{ left: "0%" }}
      />
      {hover !== null && duration ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[calc(100%+16px)] -translate-x-1/2 rounded-md bg-[rgb(22_22_24/0.85)] px-2 py-0.5 text-[12px] font-medium text-white tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          style={{ left: `${hover * 100}%` }}
        >
          {clock(hover * duration)}
        </span>
      ) : null}
    </div>
  );
}

/** Playback speed: a small menu above its button. */
function SpeedMenu({ rate, open, onOpen, onPick }: { rate: number; open: boolean; onOpen: (open: boolean) => void; onPick: (rate: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // opened: the current speed takes focus, so the arrow keys move from there
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      e.stopPropagation();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      // the menu closes, not the lightbox
      e.preventDefault();
      e.stopPropagation();
      onOpen(false);
      button.current?.focus();
    } else if (e.key === "Tab") onOpen(false);
  };

  return (
    <div data-speed-menu className="relative hidden shrink-0 @lg:block">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Playback speed, ${speedLabel(rate)}`}
        title="Playback speed"
        onClick={() => onOpen(!open)}
        className={cn(
          "grid h-9 min-w-11 place-items-center rounded-full px-2 text-[13px] font-semibold text-white/90 tabular-nums transition-colors outline-none hover:bg-white/12 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/80 @lg:h-10",
          open && "bg-white/12 text-white",
        )}
      >
        {speedLabel(rate)}
      </button>
      {open ? (
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- focus sits on the items inside, and the arrow keys move it
        <div
          ref={list}
          role="menu"
          aria-label="Playback speed"
          onKeyDown={onKeyDown}
          className="absolute right-0 bottom-[calc(100%+12px)] flex min-w-[140px] flex-col gap-0.5 rounded-2xl bg-[rgb(28_28_30/0.82)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === rate}
              onClick={() => {
                onPick(s);
                button.current?.focus();
              }}
              className="flex h-8 items-center justify-between gap-4 rounded-[10px] px-3 text-left text-[13px] text-white/90 transition-colors outline-none hover:bg-white/10 hover:text-white focus-visible:bg-white/12 focus-visible:text-white"
            >
              {s === 1 ? "Normal" : speedLabel(s)}
              {s === rate ? <Check aria-hidden className="size-4 text-lime" strokeWidth={2.2} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
