import { getAccountDatabaseName } from './accountStorage';

export type BackgroundItem = { id: string; name: string; type: 'image' | 'video'; collection?: string; url: string };

/**
 * Reads the background library (the pictures and videos in Presentations → Background) so other
 * screens, such as the song designer, can offer them. Call the returned release() when done to
 * free the preview URLs.
 */
export const readBackgroundLibrary = async (): Promise<{ items: BackgroundItem[]; release: () => void }> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(getAccountDatabaseName('faithstream.media'), 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stored = await new Promise<{ id: string; name: string; type: 'image' | 'video'; category?: string; collection?: string; blob: Blob; createdAt: number }[]>((resolve, reject) => {
    const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.transaction?.addEventListener('complete', () => db.close(), { once: true });
  });
  const items = stored
    .filter((asset) => asset.category !== 'slide' && asset.blob instanceof Blob)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((asset) => ({ id: asset.id, name: asset.name, type: asset.type, collection: asset.collection, url: URL.createObjectURL(asset.blob) }));
  return { items, release: () => items.forEach((item) => URL.revokeObjectURL(item.url)) };
};
