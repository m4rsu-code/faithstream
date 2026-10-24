export type PreparedMediaFile = { file: File; originalFile?: File };

const optimizeImage = async (file: File): Promise<PreparedMediaFile> => {
  if (!file.type.startsWith('image/') || ['image/gif', 'image/apng', 'image/svg+xml'].includes(file.type)) return { file };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / bitmap.width, 1440 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return { file };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
    if (!converted || converted.size >= file.size) return { file };
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return { file: new File([converted], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified }), originalFile: file };
  } catch {
    return { file };
  }
};

export const prepareMediaFile = async (file: File): Promise<PreparedMediaFile> => {
  if (file.type.startsWith('image/')) return optimizeImage(file);
  const optimizeVideo = window.faithstreamWindow?.optimizeVideo;
  if (!file.type.startsWith('video/') || !optimizeVideo) return { file };
  try {
    const result = await optimizeVideo(file);
    if (!result.ok || !result.optimized || !result.data || result.optimizedBytes! >= result.originalBytes!) return { file };
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const bytes = Uint8Array.from(result.data);
    const optimized = new File([bytes.buffer as ArrayBuffer], `${baseName}.mp4`, { type: 'video/mp4', lastModified: file.lastModified });
    return { file: optimized, originalFile: file };
  } catch {
    return { file };
  }
};

export const formatMediaSizeInKb = (bytes: number) => `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB`;
