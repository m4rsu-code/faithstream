import { getAccountDatabaseName } from './accountStorage';

export type BackgroundItem = { id: string; name: string; type: 'image' | 'video'; collection?: string; url: string; thumbnailUrl?: string };

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
  const stored = await new Promise<{ id: string; name: string; type: 'image' | 'video'; category?: string; collection?: string; blob: Blob; thumbnailBlob?: Blob; createdAt: number }[]>((resolve, reject) => {
    const transaction = db.transaction('assets', 'readonly');
    const request = transaction.objectStore('assets').openCursor();
    const backgrounds: { id: string; name: string; type: 'image' | 'video'; category?: string; collection?: string; blob: Blob; thumbnailBlob?: Blob; createdAt: number }[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const asset = cursor.value as typeof backgrounds[number];
      // Presentation slide assets can be much larger than backgrounds. Skip them while
      // walking the store instead of cloning every slide blob with getAll().
      if (asset.category !== 'slide' && asset.blob instanceof Blob) backgrounds.push(asset);
      cursor.continue();
    };
    transaction.oncomplete = () => { db.close(); resolve(backgrounds); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
  const localItems = stored
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((asset) => {
      const url = URL.createObjectURL(asset.blob);
      const thumbnailUrl = asset.thumbnailBlob ? URL.createObjectURL(asset.thumbnailBlob) : undefined;
      return { id: asset.id, name: asset.name, type: asset.type, collection: asset.collection, url, thumbnailUrl };
    });
  const folderItems = await window.faithstreamWindow?.listPresentationBackgrounds().catch(() => []) ?? [];
  const builtInItems: BackgroundItem[] = folderItems.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    collection: item.collection,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
  }));
  const items = [...builtInItems, ...localItems];
  return { items, release: () => localItems.forEach((item) => {
    URL.revokeObjectURL(item.url);
    if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
  }) };
};
