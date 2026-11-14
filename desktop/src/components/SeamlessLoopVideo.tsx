import { useEffect, useRef, useState, type CSSProperties } from 'react';

const LOOP_FADE_MS = 1500;
const LOOP_FADE_SECONDS = LOOP_FADE_MS / 1000;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** Keeps a background moving through its loop point by fading into a second player at the start. */
export default function SeamlessLoopVideo({
  src,
  muted = true,
  className = '',
  style,
}: {
  src: string;
  muted?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const refs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const videos = refs.current;
    let swapping = false;
    let swapTimer = 0;
    let fallbackTimer = 0;
    const frameIds: (number | undefined)[] = [undefined, undefined];
    activeRef.current = 0;
    setActive(0);
    videos.forEach((video, index) => {
      if (!video) return;
      video.pause();
      video.currentTime = 0;
      video.loop = false;
      video.preload = 'auto';
      if (index === 0) void video.play().catch(() => undefined);
    });

    const monitor = (index: number) => {
      const video = videos[index] as VideoWithFrameCallback | null;
      if (!video || index !== activeRef.current) return;
      if (video.duration > LOOP_FADE_SECONDS + 0.25 && video.duration - video.currentTime <= LOOP_FADE_SECONDS + 0.15) {
        swap(index);
        return;
      }
      if (video.requestVideoFrameCallback) frameIds[index] = video.requestVideoFrameCallback(() => monitor(index));
      else fallbackTimer = window.setTimeout(() => monitor(index), 40);
    };

    function swap(index: number) {
      if (swapping || index !== activeRef.current) return;
      const current = videos[index];
      const nextIndex = 1 - index;
      const next = videos[nextIndex];
      if (!current || !next) return;
      swapping = true;
      next.pause();
      next.currentTime = 0;
      const reveal = () => {
        activeRef.current = nextIndex;
        setActive(nextIndex);
        swapTimer = window.setTimeout(() => {
          current.pause();
          current.currentTime = 0;
          swapping = false;
          monitor(nextIndex);
        }, LOOP_FADE_MS);
      };
      void next.play().then(() => {
        const frameVideo = next as VideoWithFrameCallback;
        if (frameVideo.requestVideoFrameCallback) frameIds[nextIndex] = frameVideo.requestVideoFrameCallback(reveal);
        else window.setTimeout(reveal, 40);
      }).catch(() => {
        // If the spare decoder cannot start, restart the current player without waiting for its native loop.
        current.currentTime = 0;
        void current.play().catch(() => undefined);
        swapping = false;
      });
    }

    const onEnded = (index: number) => () => swap(index);
    const handlers = videos.map((video, index) => {
      const handleEnded = onEnded(index);
      video?.addEventListener('ended', handleEnded);
      return handleEnded;
    });
    monitor(0);
    return () => {
      window.clearTimeout(swapTimer);
      window.clearTimeout(fallbackTimer);
      videos.forEach((video, index) => {
        if (!video) return;
        video.removeEventListener('ended', handlers[index]);
        const frameVideo = video as VideoWithFrameCallback;
        if (frameIds[index] !== undefined) frameVideo.cancelVideoFrameCallback?.(frameIds[index]!);
        video.pause();
      });
    };
  }, [src]);

  return <div className={`absolute inset-0 overflow-hidden ${className}`} style={style} aria-hidden="true">
    {[0, 1].map((index) => <video
      key={`${src}:${index}`}
      ref={(video) => { refs.current[index] = video; }}
      src={src}
      muted={muted || active !== index}
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full object-cover"
      style={{ opacity: index === active ? 1 : 0, transition: `opacity ${LOOP_FADE_MS}ms linear`, objectPosition: style?.objectPosition }}
    />)}
  </div>;
}
