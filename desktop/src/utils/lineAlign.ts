/**
 * Per-line (paragraph) text alignment for slide text boxes.
 *
 * A text box has one alignment for the whole box (`align`). Single lines can override it
 * with `lineAligns[i]` (i = paragraph index, counting lines split by "\n"); `null` or a
 * missing entry means "follow the box". Older slides simply have no `lineAligns`.
 */
export type LineAlign = 'left' | 'center' | 'right' | 'justify';
export type LineAligns = (LineAlign | null)[];

/** The alignment line `index` is shown with. */
export const lineAlignAt = (boxAlign: LineAlign, lineAligns: LineAligns | undefined, index: number): LineAlign => lineAligns?.[index] ?? boxAlign;

export const hasLineAligns = (lineAligns: LineAligns | undefined): lineAligns is LineAligns => !!lineAligns?.some(Boolean);

/** Which line (paragraph) a character offset falls in. */
const lineIndexAt = (text: string, offset: number) => {
  let line = 0;
  for (let i = 0; i < Math.min(offset, text.length); i += 1) if (text[i] === '\n') line += 1;
  return line;
};

/**
 * Keeps each line's own alignment when the text is edited: unchanged lines at the start and
 * end keep theirs, and new or changed lines take the alignment of the line they came from.
 */
export function remapLineAligns(oldText: string, newText: string, lineAligns: LineAligns | undefined): LineAligns | undefined {
  if (!hasLineAligns(lineAligns)) return undefined;
  const before = oldText.split('\n');
  const after = newText.split('\n');
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
  const changedOld = before.length - start - end;
  const inherit = changedOld > 0 ? lineAligns[start] ?? null : lineAligns[start - 1] ?? lineAligns[start] ?? null;
  const next: LineAligns = [
    ...after.slice(0, start).map((_, index) => lineAligns[index] ?? null),
    ...Array.from({ length: after.length - start - end }, () => inherit),
    ...after.slice(after.length - end).map((_, index) => lineAligns[before.length - end + index] ?? null),
  ];
  return hasLineAligns(next) ? next : undefined;
}

export type TextRange = { start: number; end: number };

/** True when the range picks out some of the text (not nothing, and not all of it). */
export const isPartialRange = (text: string, range: TextRange | null | undefined): range is TextRange =>
  !!range && range.end > range.start && range.end <= text.length && !(range.start <= 0 && range.end >= text.length);

/** The lines a highlighted range covers (a range ending just after a line break stops at that line). */
const rangeLines = (text: string, range: TextRange) => {
  const first = lineIndexAt(text, range.start);
  let last = lineIndexAt(text, range.end);
  if (last > first && text[range.end - 1] === '\n') last -= 1;
  return { first, last };
};

/**
 * Applies an alignment. With some text highlighted only those lines change; otherwise
 * (nothing highlighted, or everything) the whole box changes and line overrides are cleared.
 */
export function alignText(text: string, boxAlign: LineAlign, lineAligns: LineAligns | undefined, value: LineAlign, range: TextRange | null | undefined): { align: LineAlign; lineAligns: LineAligns | undefined } {
  if (!isPartialRange(text, range)) return { align: value, lineAligns: undefined };
  const { first, last } = rangeLines(text, range);
  const next = text.split('\n').map((_, index) => {
    const own = index >= first && index <= last ? value : lineAligns?.[index] ?? null;
    return own === boxAlign ? null : own;
  });
  return { align: boxAlign, lineAligns: hasLineAligns(next) ? next : undefined };
}

/** The alignment to highlight in the toolbar: the first highlighted line's, else the box's. */
export function activeAlign(text: string, boxAlign: LineAlign, lineAligns: LineAligns | undefined, range: TextRange | null | undefined): LineAlign {
  if (!isPartialRange(text, range)) return boxAlign;
  return lineAlignAt(boxAlign, lineAligns, rangeLines(text, range).first);
}
