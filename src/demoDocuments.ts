// Development-only receipt storage. IndexedDB keeps binary files across reloads
// without filling localStorage, which holds the demo's event and participant data.
async function documents<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('manos-demo-documents', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => {
    throw new Error(
      'No pudimos abrir el almacenamiento de documentos de prueba. Volvé a intentar.',
    );
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('documents', mode);
      const request = operation(transaction.objectStore('documents'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(
          new Error(
            'No pudimos guardar o leer el documento de prueba. Volvé a intentar.',
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function saveDemoDocuments(id: string, files: File[]) {
  await documents('readwrite', (store) => store.put(files, id));
}
export async function readDemoDocument(
  id: string,
  index: number,
): Promise<Blob> {
  const files = await documents<File[] | undefined>('readonly', (store) =>
    store.get(id),
  );
  const file = files?.[index];
  if (!file) throw new Error('No encontramos el documento de prueba.');
  return file;
}
export async function removeDemoDocuments(id: string) {
  await documents('readwrite', (store) => store.delete(id));
}
