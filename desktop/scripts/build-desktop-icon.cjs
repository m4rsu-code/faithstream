const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const desktopRoot = path.resolve(__dirname, '..');
const source = path.join(desktopRoot, 'src/assets/img/desktop-icon.png');
const ffmpeg = require('ffmpeg-static');
const outputFiles = [
  path.join(desktopRoot, 'src/assets/icons/win/faithstream-studio.ico'),
  path.join(desktopRoot, 'src/assets/icons/win/icon.ico'),
];
const sizes = [16, 24, 32, 48, 64, 128, 256];

if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error('The project FFmpeg binary is unavailable.');
if (!fs.existsSync(source)) throw new Error(`Desktop icon source not found: ${source}`);

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faithstream-desktop-icon-'));

try {
  const frames = sizes.map((size) => {
    const output = path.join(tempDirectory, `${size}.png`);
    const filter = `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`;
    const result = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-vf', filter, '-frames:v', '1', output,
    ], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || `Could not create ${size}x${size} icon frame.`);
    return fs.readFileSync(output);
  });

  const headerBytes = 6;
  const directoryEntryBytes = 16;
  let dataOffset = headerBytes + directoryEntryBytes * sizes.length;
  const directory = Buffer.alloc(directoryEntryBytes * sizes.length);

  sizes.forEach((size, index) => {
    const entryOffset = directoryEntryBytes * index;
    const frame = frames[index];
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2); // palette size
    directory.writeUInt8(0, entryOffset + 3); // reserved
    directory.writeUInt16LE(1, entryOffset + 4); // color planes
    directory.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    directory.writeUInt32LE(frame.length, entryOffset + 8);
    directory.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += frame.length;
  });

  const header = Buffer.alloc(headerBytes);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const icon = Buffer.concat([header, directory, ...frames]);
  for (const output of outputFiles) fs.writeFileSync(output, icon);

  console.log(`Built Windows icon from desktop-icon.png (${sizes.join(', ')} px).`);
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
