import { useEffect, useState } from 'react';

export type CountdownSettings = {
  targetAt: string;
  label: string;
  color: string;
  align?: 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  size?: number;
};

export default function CountdownDisplay({ countdown }: { countdown: CountdownSettings }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const target = new Date(countdown.targetAt).getTime();
  const remaining = Number.isFinite(target) ? Math.max(0, target - now) : 0;
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = days > 0
    ? [`${days}d`, `${String(hours).padStart(2, '0')}h`, `${String(minutes).padStart(2, '0')}m`, `${String(seconds).padStart(2, '0')}s`]
    : [`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`];
  const align = countdown.align ?? 'center';
  const alignmentClass = align === 'left' ? 'items-start text-left' : align === 'right' ? 'items-end text-right' : 'items-center text-center';

  return (
    <div className={`absolute z-10 flex flex-col justify-center overflow-hidden ${alignmentClass}`} style={{ left: `${countdown.x ?? 10}%`, top: `${countdown.y ?? 30}%`, width: `${countdown.w ?? 80}%`, height: `${countdown.h ?? 40}%`, color: countdown.color }}>
      {countdown.label.trim() && <p className="mb-[.8cqw] max-w-full truncate text-[clamp(12px,3cqw,34px)] font-semibold drop-shadow-lg">{countdown.label}</p>}
      <p role="timer" aria-live="off" className="max-w-full whitespace-nowrap font-bold leading-none tracking-wide drop-shadow-2xl" style={{ fontSize: `${((countdown.size ?? 112) / 1280) * 100}cqw` }}>
        {parts.map((part, index) => <span key={index} className={days > 0 ? 'mx-[.4cqw]' : undefined}>{part}</span>)}
      </p>
      {remaining === 0 && <p className="mt-[1cqw] text-[clamp(11px,2.2cqw,24px)] font-semibold drop-shadow-lg">Starting now</p>}
    </div>
  );
}
