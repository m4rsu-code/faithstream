import { getAccountStorageKey } from './accountStorage';

/* ---------- File ordering ---------- */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sorts like people expect: "Slide 2" before "Slide 10". */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

const IGNORED_FILES = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i;
export const isIgnoredFile = (name: string) => IGNORED_FILES.test(name);

export const isSlideImage = (file: File) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
export const isPowerPoint = (file: File) => /\.pptx$/i.test(file.name);
export const isBackgroundMedia = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/')
  || /\.(png|jpe?g|webp|gif|bmp|mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name);

/* ---------- Folders ---------- */

/** A file together with its path inside the folder the user picked or dropped, e.g. "Songs/Amazing Grace/01.png". */
export type PathedFile = { file: File; path: string };

export type FolderGroup = {
  /** Name of the folder the files sit in ("Amazing Grace"). */
  name: string;
  /** Full folder path inside the import ("Songs/Amazing Grace"). */
  path: string;
  /** Name of the top folder that was imported when it held subfolders ("Songs"), otherwise undefined. */
  parentName?: string;
  /** Files directly in this folder, in natural order. */
  files: File[];
};

/** Files picked with a folder picker carry their relative path in webkitRelativePath. */
export const pathedFilesFromInput = (list: FileList | null): PathedFile[] => Array.from(list ?? []).map((file) => ({
  file,
  path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
}));

/** Groups files by the folder they live in. Each folder becomes one group. */
export const groupByFolder = (files: PathedFile[]): FolderGroup[] => {
  const usable = files.filter(({ file, path }) => !isIgnoredFile(file.name) && !path.split('/').some((part) => part.startsWith('.')));
  const groups = new Map<string, FolderGroup>();
  const hasSubfolders = usable.some(({ path }) => path.split('/').length > 2);
  for (const { file, path } of usable) {
    const parts = path.split('/');
    parts.pop();
    const dir = parts.join('/');
    let group = groups.get(dir);
    if (!group) {
      group = {
        name: parts[parts.length - 1] || file.name.replace(/\.[^.]+$/, ''),
        path: dir,
        parentName: hasSubfolders && parts.length > 1 ? parts[0] : undefined,
        files: [],
      };
      groups.set(dir, group);
    }
    group.files.push(file);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, files: group.files.sort((a, b) => naturalCompare(a.name, b.name)) }))
    .sort((a, b) => naturalCompare(a.path, b.path));
};

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, failure?: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: FsEntry[]) => void, failure?: (error: unknown) => void) => void };
};

const readEntry = async (entry: FsEntry, prefix: string, out: PathedFile[]) => {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push({ file, path });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches; keep reading until it returns nothing.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await readEntry(child, path, out);
    }
  }
};

/** Reads files and whole folders dropped onto the window, keeping their folder paths. */
export const readDroppedFiles = async (dataTransfer: DataTransfer): Promise<PathedFile[]> => {
  const entries = Array.from(dataTransfer.items ?? [])
    // Must run before the drop event ends; the browser clears the items afterwards.
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null) as unknown as FsEntry | null)
    .filter((entry): entry is FsEntry => entry !== null);
  if (!entries.length) return Array.from(dataTransfer.files).map((file) => ({ file, path: file.name }));
  const out: PathedFile[] = [];
  for (const entry of entries) await readEntry(entry, '', out);
  return out;
};

export const dragHasFiles = (event: { dataTransfer: DataTransfer | null }) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');

/* ---------- Lyrics ---------- */

export type LyricSection = { label?: string; text: string };
/** Invisible design-editor line used to preserve blank spacing inside one lyric slide. */
export const PRESERVED_BLANK_LINE = '\u200B';

const SECTION_LABEL = /^\s*[[(]?\s*((?:verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|coda|interlude)(?:\s*\d+)?)\s*[\])]?\s*:?\s*$/i;

/**
 * Splits pasted lyrics into slides. A blank line starts a new slide. A line such as
 * "Verse 1", "[Chorus]" or "Bridge:" names the next slide instead of being shown.
 * Sections longer than maxLines are split evenly so text stays readable from the back row.
 */
export const splitLyrics = (raw: string, maxLines = 4): LyricSection[] => {
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const sections: LyricSection[] = [];
  let pendingLabel: string | undefined;
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const content: string[] = [];
    let label = pendingLabel;
    pendingLabel = undefined;
    for (const line of lines) {
      const match = SECTION_LABEL.exec(line);
      if (match) {
        if (content.length) {
          sections.push(...chunk(content.splice(0), label, maxLines));
        }
        label = match[1].replace(/\s+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
      } else {
        content.push(line);
      }
    }
    if (content.length) sections.push(...chunk(content, label, maxLines));
    else if (label) pendingLabel = label;
  }
  return sections;
};

const chunk = (lines: string[], label: string | undefined, maxLines: number): LyricSection[] => {
  const limit = Math.max(1, maxLines);
  const lyricLines = lines.filter((line) => line !== PRESERVED_BLANK_LINE).length;
  if (lyricLines <= limit) return [{ label, text: lines.join('\n') }];
  const parts = Math.ceil(lyricLines / limit);
  const size = Math.ceil(lyricLines / parts);
  const groups: string[][] = [[]];
  let groupIndex = 0;
  let groupLineCount = 0;
  let pendingSpacing: string[] = [];
  for (const line of lines) {
    if (line === PRESERVED_BLANK_LINE) {
      pendingSpacing.push(line);
      continue;
    }
    if (groupLineCount >= size && groupIndex < parts - 1) {
      groups.push([]);
      groupIndex += 1;
      groupLineCount = 0;
    }
    groups[groupIndex].push(...pendingSpacing, line);
    pendingSpacing = [];
    groupLineCount += 1;
  }
  groups[groupIndex].push(...pendingSpacing);
  return groups.map((group, index) => ({ label: label ? `${label}${parts > 1 ? ` (${index + 1}/${parts})` : ''}` : undefined, text: group.join('\n') }));
};

/* ---------- Presentation categories ---------- */

const CATEGORIES_KEY = 'faithstream.presentation-categories';
export const DEFAULT_CATEGORIES = ['Songs', 'Sermons', 'Scripture', 'Announcements'];

/** Categories are kept on this device, keyed by presentation id, so account sync never overwrites them. */
export const loadPresentationCategories = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(getAccountStorageKey(CATEGORIES_KEY)) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''));
  } catch {
    return {};
  }
};

export const savePresentationCategories = (categories: Record<string, string>) => {
  try { localStorage.setItem(getAccountStorageKey(CATEGORIES_KEY), JSON.stringify(categories)); } catch { /* Keep categories for this session if storage is full. */ }
};

export const cleanCategoryName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 40);
