import { useCallback, useEffect, useLayoutEffect, useRef, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type PointerEvent, type MouseEvent, type RefObject } from 'react';
import { lineAlignAt, type LineAlign, type LineAligns } from '../utils/lineAlign';

/*
 * The on-slide text editor. A <textarea> can only align all of its text one way, so this is a
 * plain-text editable box where every line is its own block and can have its own alignment.
 * The text is still plain text: lines are joined with "\n".
 */

const isBlock = (node: Node): node is HTMLElement => node instanceof HTMLElement && (node.tagName === 'DIV' || node.tagName === 'P');

/** Reads the lines currently in the editor. */
function readLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  let loose: string | null = null;
  const flush = () => { if (loose !== null) { lines.push(loose); loose = null; } };
  root.childNodes.forEach((node) => {
    if (isBlock(node)) { flush(); lines.push(node.textContent ?? ''); }
    else if (node.nodeName === 'BR') { if (loose === null) loose = ''; flush(); }
    else loose = (loose ?? '') + (node.textContent ?? '');
  });
  flush();
  return lines.length ? lines.map((line) => line.replace(/​/g, '')) : [''];
}

/** True when the editor holds exactly one plain <div> per line (text only, or a <br> when empty). */
function isClean(root: HTMLElement, lines: string[]) {
  if (root.childNodes.length !== lines.length) return false;
  return Array.from(root.childNodes).every((node, index) => {
    if (!(node instanceof HTMLDivElement)) return false;
    const children = node.childNodes;
    if (!lines[index]) return children.length === 1 && children[0].nodeName === 'BR';
    return children.length === 1 && children[0].nodeType === Node.TEXT_NODE;
  });
}

function renderLines(root: HTMLElement, lines: string[]) {
  root.replaceChildren(...lines.map((line) => {
    const block = document.createElement('div');
    if (line) block.textContent = line; else block.appendChild(document.createElement('br'));
    return block;
  }));
}

/** Converts a DOM position in the editor to a character offset in the text. */
function toOffset(root: HTMLElement, node: Node, offset: number): number {
  const children = Array.from(root.childNodes);
  const length = (child: Node) => (child.textContent ?? '').length;
  if (node === root) {
    let total = 0;
    for (let index = 0; index < Math.min(offset, children.length); index += 1) total += length(children[index]) + 1;
    return Math.max(0, offset >= children.length ? total - 1 : total);
  }
  let top: Node | null = node;
  while (top && top.parentNode !== root) top = top.parentNode;
  if (!top) return 0;
  const index = children.indexOf(top as ChildNode);
  let total = 0;
  for (let i = 0; i < index; i += 1) total += length(children[i]) + 1;
  const range = document.createRange();
  range.setStart(top, 0);
  range.setEnd(node, offset);
  return total + range.toString().length;
}

/** Converts a character offset back to a DOM position (the editor must be clean). */
function toPoint(root: HTMLElement, offset: number): [Node, number] {
  let left = offset;
  const children = Array.from(root.childNodes);
  for (const child of children) {
    const length = (child.textContent ?? '').length;
    if (left <= length) return child.firstChild?.nodeType === Node.TEXT_NODE ? [child.firstChild, left] : [child, 0];
    left -= length + 1;
  }
  const last = children[children.length - 1];
  if (!last) return [root, 0];
  return last.firstChild?.nodeType === Node.TEXT_NODE ? [last.firstChild, (last.textContent ?? '').length] : [last, 0];
}

function readSelection(root: HTMLElement): [number, number] | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = toOffset(root, range.startContainer, range.startOffset);
  const end = toOffset(root, range.endContainer, range.endOffset);
  return [Math.min(start, end), Math.max(start, end)];
}

function writeSelection(root: HTMLElement, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const [startNode, startOffset] = toPoint(root, start);
  const [endNode, endOffset] = toPoint(root, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

type Props = {
  text: string;
  align: LineAlign;
  lineAligns?: LineAligns;
  onChange: (text: string) => void;
  /** The highlighted part of the text, as character offsets (start === end for just a caret). */
  onSelectionChange?: (start: number, end: number) => void;
  editorRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: CSSProperties;
  label?: string;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export default function SlideTextEditor({ text, align, lineAligns, onChange, onSelectionChange, editorRef, className, style, label, onPointerDown, onClick }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const latestText = useRef(text);
  const composing = useRef(false);
  const pendingSelection = useRef<[number, number] | null>(null);
  const selectionListener = useRef(onSelectionChange);

  useLayoutEffect(() => {
    latestText.current = text;
    selectionListener.current = onSelectionChange;
  });

  const setRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    if (editorRef) editorRef.current = element;
  }, [editorRef]);

  // Keep the editor's lines in step with the text (typing, undo, the Format panel) and
  // give every line its alignment.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || composing.current) return;
    const lines = text.split('\n');
    if (readLines(element).join('\n') !== text || !isClean(element, lines)) {
      const focused = document.activeElement === element;
      const keep = pendingSelection.current ?? (focused ? readSelection(element) : null);
      renderLines(element, lines);
      if (keep && focused) writeSelection(element, Math.min(keep[0], text.length), Math.min(keep[1], text.length));
    }
    pendingSelection.current = null;
    element.childNodes.forEach((node, index) => {
      if (!(node instanceof HTMLElement)) return;
      const value = lineAlignAt(align, lineAligns, index);
      node.style.textAlign = value;
      node.style.textAlignLast = value === 'justify' ? 'left' : '';
    });
  }, [text, align, lineAligns]);

  // Report the highlighted text while the editor has focus. Clicking a toolbar button moves
  // focus away, so the last highlight is kept for that button to use.
  useEffect(() => {
    const onChangeSelection = () => {
      const element = root.current;
      if (!element || document.activeElement !== element) return;
      const range = readSelection(element);
      if (range) selectionListener.current?.(range[0], range[1]);
    };
    document.addEventListener('selectionchange', onChangeSelection);
    return () => document.removeEventListener('selectionchange', onChangeSelection);
  }, []);

  const replaceSelection = (insert: string) => {
    const element = root.current;
    if (!element) return;
    const current = latestText.current;
    const [start, end] = readSelection(element) ?? [current.length, current.length];
    const next = current.slice(0, start) + insert + current.slice(end);
    pendingSelection.current = [start + insert.length, start + insert.length];
    if (next !== current) onChange(next);
  };

  const handleInput = () => {
    const element = root.current;
    if (!element || composing.current) return;
    const next = readLines(element).join('\n');
    if (next !== latestText.current) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      replaceSelection('\n');
      return;
    }
    // Undo / redo are handled by the editor's own history (it listens on the window).
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) event.preventDefault();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    replaceSelection(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
  };

  return (
    <div
      ref={setRoot}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={(event) => event.preventDefault()}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; handleInput(); }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={className}
      style={style}
    />
  );
}
