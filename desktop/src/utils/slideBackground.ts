import type { CSSProperties } from 'react';

/*
 * Slide backgrounds are usually a preset gradient, stored as Tailwind classes. A background
 * the user picks with the colour picker is stored in the same field as
 * "color:#RRGGBB" (one colour) or "color:#RRGGBB>#RRGGBB" (a two-colour blend), so every
 * place that already carries a slide's background carries custom colours too.
 */
const PREFIX = 'color:';
const HEX = /^#[0-9a-f]{6}$/i;

export type CustomBackground = { from: string; to?: string };

export const customBackground = (from: string, to?: string) => `${PREFIX}${from.toUpperCase()}${to ? `>${to.toUpperCase()}` : ''}`;

export const parseCustomBackground = (bg: string | undefined | null): CustomBackground | null => {
  if (!bg?.startsWith(PREFIX)) return null;
  const [from, to] = bg.slice(PREFIX.length).split('>');
  if (!HEX.test(from ?? '')) return null;
  return { from, to: to && HEX.test(to) ? to : undefined };
};

export const isCustomBackground = (bg: string | undefined | null) => !!parseCustomBackground(bg);

/** The CSS classes for a background (none for a custom colour, which is drawn with a style). */
export const backgroundClasses = (bg: string | undefined | null) => (isCustomBackground(bg) ? '' : bg ?? '');

/** Inline style for a custom colour background; undefined for preset gradients. */
export const backgroundStyle = (bg: string | undefined | null): CSSProperties | undefined => {
  const custom = parseCustomBackground(bg);
  if (!custom) return undefined;
  return custom.to
    ? { backgroundColor: custom.from, backgroundImage: `linear-gradient(to bottom right, ${custom.from}, ${custom.to})` }
    : { backgroundColor: custom.from, backgroundImage: 'none' };
};

/** The two colours to paint a custom background with on a canvas (the stream), or null. */
export const customBackgroundStops = (bg: string | undefined | null): [string, string] | null => {
  const custom = parseCustomBackground(bg);
  return custom ? [custom.from, custom.to ?? custom.from] : null;
};
