import SeamlessLoopVideo from './SeamlessLoopVideo';

export type SlideBackgroundMedia = {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
};

/** Shared background renderer for presentation, scripture, songbook, Studio and monitor slides. */
export default function SlideBackgroundLayer({
  media,
  imageUrl,
  videoUrl,
  posterUrl,
  opacity = 100,
  dim = 0,
  muted = true,
  position,
  seamless = false,
  still = false,
  eager = true,
}: {
  media?: SlideBackgroundMedia;
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  opacity?: number;
  dim?: number;
  muted?: boolean;
  position?: string;
  seamless?: boolean;
  still?: boolean;
  eager?: boolean;
}) {
  const image = media?.type === 'image' ? media.url : media?.type === 'video' ? media.thumbnailUrl : imageUrl ?? posterUrl;
  const video = media?.type === 'video' ? media.url : videoUrl;
  const poster = media?.thumbnailUrl ?? posterUrl ?? image;
  const objectPosition = position ?? '50% 50%';

  return <>
    {(image || video) && <div className="absolute inset-0" style={{ opacity: opacity / 100 }}>
      {image && <img src={image} alt="" draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} />}
      {video && (still
        ? poster
          ? <img src={poster} alt="" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} />
          : <video src={`${video}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} />
        : seamless
          ? <SeamlessLoopVideo key={video} src={video} muted={muted} poster={poster} style={{ objectPosition }} />
          : <video src={video} poster={poster} autoPlay loop muted={muted} playsInline preload={eager ? 'auto' : 'metadata'} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} />)}
    </div>}
    {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim / 100 }} />}
  </>;
}
