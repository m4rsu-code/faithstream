import { useEffect, useState } from 'react';

/** How the time left is written. */
export type CountdownFormat = 'auto' | 'clock' | 'minutes' | 'words' | 'boxes';
export type CountdownUnits = { days: string; hours: string; minutes: string; seconds: string };

export type CountdownSettings = {
  targetAt: string;
  /** Text shown with the timer, e.g. "Service starts in". Empty hides it. */
  label: string;
  /** Timer (numbers) colour. */
  color: string;
  align?: 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Number size, px on a 1280-wide slide. */
  size?: number;
  format?: CountdownFormat;
  showSeconds?: boolean;
  /** Words for "words" and "boxes" styles (any language). */
  units?: Partial<CountdownUnits>;
  font?: string;
  bold?: boolean;
  shadow?: boolean;
  labelPosition?: 'above' | 'below';
  /** Label size, px on a 1280-wide slide. */
  labelSize?: number;
  labelColor?: string;
  labelBold?: boolean;
  /** Text when the time is up, e.g. "Starting now". Empty shows nothing. */
  endText?: string;
  /** "below": keep 00:00 and show the text under it. "replace": show only the text. */
  endMode?: 'below' | 'replace';
};

export const DEFAULT_COUNTDOWN_UNITS: CountdownUnits = { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' };
export const COUNTDOWN_FONTS = ['Montserrat', 'Poppins', 'Segoe UI', 'Arial', 'Arial Black', 'Georgia', 'Cambria', 'Courier New', 'Consolas'];

const pad = (value: number) => String(value).padStart(2, '0');

export type CountdownView = {
  done: boolean;
  /** One piece of text ("01:05:09", "2 days 3 hours"), or boxes of number + unit. */
  text: string;
  boxes: { value: string; unit: string }[] | null;
};

/** Works out what the countdown shows at a moment in time. Used on screen and on the stream. */
export function countdownView(countdown: CountdownSettings, now: number): CountdownView {
  const target = new Date(countdown.targetAt).getTime();
  const remaining = Number.isFinite(target) ? Math.max(0, target - now) : 0;
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const showSeconds = countdown.showSeconds ?? true;
  const custom = countdown.units;
  const units: CountdownUnits = { ...DEFAULT_COUNTDOWN_UNITS, ...Object.fromEntries(Object.entries(custom ?? {}).filter(([, word]) => typeof word === 'string' && word.trim())) };
  // English defaults read "1 Day", not "1 Days". Words the user typed are kept as typed.
  const word = (key: keyof CountdownUnits, value: number) => (!custom?.[key]?.trim() && value === 1 ? units[key].replace(/s$/, '') : units[key]);
  const format = countdown.format ?? 'auto';
  const done = remaining === 0;

  if (format === 'boxes') {
    const boxes = [
      ...(days > 0 ? [{ value: String(days), unit: word('days', days) }] : []),
      { value: pad(hours), unit: word('hours', hours) },
      { value: pad(minutes), unit: word('minutes', minutes) },
      ...(showSeconds ? [{ value: pad(seconds), unit: word('seconds', seconds) }] : []),
    ];
    return { done, text: boxes.map((box) => box.value).join(':'), boxes };
  }
  if (format === 'words') {
    const parts = [
      days > 0 ? `${days} ${word('days', days)}` : '',
      days > 0 || hours > 0 ? `${hours} ${word('hours', hours)}` : '',
      `${minutes} ${word('minutes', minutes)}`,
      showSeconds ? `${seconds} ${word('seconds', seconds)}` : '',
    ].filter(Boolean);
    return { done, text: parts.join('  '), boxes: null };
  }
  if (format === 'minutes') {
    const allMinutes = Math.floor(total / 60);
    return { done, text: showSeconds ? `${pad(allMinutes)}:${pad(seconds)}` : `${allMinutes}`, boxes: null };
  }
  if (format === 'clock' || days === 0) {
    const allHours = days * 24 + hours;
    return { done, text: showSeconds ? `${pad(allHours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(allHours)}:${pad(minutes)}`, boxes: null };
  }
  return { done, text: [`${days}d`, `${pad(hours)}h`, `${pad(minutes)}m`, ...(showSeconds ? [`${pad(seconds)}s`] : [])].join(' '), boxes: null };
}

export const countdownFont = (countdown: CountdownSettings) => `"${(countdown.font ?? 'Montserrat').replaceAll('"', '')}", "Segoe UI", sans-serif`;

export default function CountdownDisplay({ countdown }: { countdown: CountdownSettings }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const view = countdownView(countdown, now);
  const align = countdown.align ?? 'center';
  const alignmentClass = align === 'left' ? 'items-start text-left' : align === 'right' ? 'items-end text-right' : 'items-center text-center';
  const cqw = (px: number) => `${(px / 1280) * 100}cqw`;
  const size = countdown.size ?? 112;
  const shadow = countdown.shadow ?? true;
  const font = countdownFont(countdown);
  const endText = countdown.endText ?? 'Starting now';
  const replaced = view.done && countdown.endMode === 'replace' && !!endText.trim();
  const label = countdown.label.trim() && (
    <p className="max-w-full truncate" style={{ fontFamily: font, fontSize: cqw(countdown.labelSize ?? 34), fontWeight: countdown.labelBold ?? true ? 700 : 500, color: countdown.labelColor ?? countdown.color, textShadow: shadow ? '0 0.2cqw 0.8cqw rgba(0,0,0,0.6)' : undefined, margin: `${cqw(8)} 0` }}>{countdown.label}</p>
  );
  const numberStyle = { fontFamily: font, fontWeight: countdown.bold ?? true ? 800 : 500, fontVariantNumeric: 'tabular-nums' as const, textShadow: shadow ? '0 0.3cqw 1.4cqw rgba(0,0,0,0.65)' : undefined };

  return (
    <div className={`absolute z-10 flex flex-col justify-center overflow-hidden ${alignmentClass}`} style={{ left: `${countdown.x ?? 10}%`, top: `${countdown.y ?? 30}%`, width: `${countdown.w ?? 80}%`, height: `${countdown.h ?? 40}%`, color: countdown.color }}>
      {(countdown.labelPosition ?? 'above') === 'above' && label}
      {replaced ? (
        <p className="max-w-full leading-tight" style={{ ...numberStyle, fontSize: cqw(size * 0.6) }}>{endText}</p>
      ) : view.boxes ? (
        <div role="timer" aria-live="off" className="flex max-w-full items-start" style={{ gap: cqw(size * 0.25) }}>
          {view.boxes.map((box, index) => (
            <div key={index} className="flex flex-col items-center">
              <span className="leading-none" style={{ ...numberStyle, fontSize: cqw(size) }}>{box.value}</span>
              <span className="uppercase" style={{ fontFamily: font, fontSize: cqw(Math.max(14, size * 0.18)), fontWeight: 600, letterSpacing: cqw(2), marginTop: cqw(size * 0.08), opacity: 0.85, textShadow: numberStyle.textShadow }}>{box.unit}</span>
            </div>
          ))}
        </div>
      ) : (
        <p role="timer" aria-live="off" className="max-w-full whitespace-nowrap leading-none" style={{ ...numberStyle, fontSize: cqw(countdown.format === 'words' ? size * 0.55 : size) }}>{view.text}</p>
      )}
      {countdown.labelPosition === 'below' && label}
      {view.done && !replaced && endText.trim() && <p className="max-w-full truncate font-semibold" style={{ fontFamily: font, fontSize: cqw(Math.max(18, size * 0.24)), marginTop: cqw(10), textShadow: numberStyle.textShadow }}>{endText}</p>}
    </div>
  );
}

/** Draws the countdown on the stream's canvas, matching CountdownDisplay. `w` / `h` are the slide's size. */
export function paintCountdown(ctx: CanvasRenderingContext2D, countdown: CountdownSettings, w: number, h: number, now = Date.now()) {
  const view = countdownView(countdown, now);
  const px = (value: number) => (value / 1280) * w;
  const bx = ((countdown.x ?? 10) / 100) * w;
  const by = ((countdown.y ?? 30) / 100) * h;
  const bw = ((countdown.w ?? 80) / 100) * w;
  const bh = ((countdown.h ?? 40) / 100) * h;
  const font = countdownFont(countdown);
  const size = px(countdown.size ?? 112);
  const align = countdown.align ?? 'center';
  const endText = countdown.endText ?? 'Starting now';
  const replaced = view.done && countdown.endMode === 'replace' && !!endText.trim();
  type Row = { height: number; draw: (top: number) => void };
  const anchorX = align === 'left' ? bx : align === 'right' ? bx + bw : bx + bw / 2;
  const textRow = (text: string, fontSize: number, weight: number, color: string): Row => ({
    height: fontSize * 1.25,
    draw: (top) => { ctx.font = `${weight} ${fontSize}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, anchorX, top + fontSize * 0.62, bw); },
  });
  const rows: Row[] = [];
  const labelRow = countdown.label.trim() ? textRow(countdown.label, px(countdown.labelSize ?? 34), countdown.labelBold ?? true ? 700 : 500, countdown.labelColor ?? countdown.color) : null;
  if (labelRow && (countdown.labelPosition ?? 'above') === 'above') rows.push(labelRow);
  const weight = countdown.bold ?? true ? 800 : 500;
  if (replaced) rows.push(textRow(endText, size * 0.6, weight, countdown.color));
  else if (view.boxes) {
    const boxes = view.boxes;
    const unitSize = px(Math.max(14, (countdown.size ?? 112) * 0.18));
    rows.push({
      height: size * 1.1 + unitSize * 1.6,
      draw: (top) => {
        const gap = size * 0.25;
        const widths = boxes.map((box) => {
          ctx.font = `${weight} ${size}px ${font}`;
          const valueWidth = ctx.measureText(box.value).width;
          ctx.font = `600 ${unitSize}px ${font}`;
          return Math.max(valueWidth, ctx.measureText(box.unit.toUpperCase()).width);
        });
        const total = widths.reduce((sum, width) => sum + width, 0) + gap * (boxes.length - 1);
        let left = align === 'left' ? bx : align === 'right' ? bx + bw - total : bx + (bw - total) / 2;
        ctx.textAlign = 'center';
        boxes.forEach((box, index) => {
          const centre = left + widths[index] / 2;
          ctx.fillStyle = countdown.color;
          ctx.font = `${weight} ${size}px ${font}`; ctx.fillText(box.value, centre, top + size * 0.55);
          ctx.globalAlpha *= 0.85; ctx.font = `600 ${unitSize}px ${font}`; ctx.fillText(box.unit.toUpperCase(), centre, top + size * 1.1 + unitSize * 0.7); ctx.globalAlpha /= 0.85;
          left += widths[index] + gap;
        });
      },
    });
  } else rows.push(textRow(view.text, countdown.format === 'words' ? size * 0.55 : size, weight, countdown.color));
  if (labelRow && countdown.labelPosition === 'below') rows.push(labelRow);
  if (view.done && !replaced && endText.trim()) rows.push(textRow(endText, px(Math.max(18, (countdown.size ?? 112) * 0.24)), 600, countdown.color));

  const total = rows.reduce((sum, row) => sum + row.height, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  ctx.textBaseline = 'middle';
  ctx.shadowColor = countdown.shadow ?? true ? 'rgba(0,0,0,.65)' : 'transparent';
  ctx.shadowBlur = countdown.shadow ?? true ? size * 0.12 : 0;
  let top = by + (bh - total) / 2;
  for (const row of rows) { row.draw(top); top += row.height; }
  ctx.restore();
}
