/**
 * @fileOverview IndexedDB utility for local novel storage.
 */

const DB_NAME = "booksDB";
const DB_VERSION = 1;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return;
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("chapters")) {
        const chapterStore = db.createObjectStore("chapters", {
          keyPath: ["bookId", "chapterNumber"]
        });
        chapterStore.createIndex("bookId", "bookId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalBook(book: any) {
  const db = await openDB();
  const tx = db.transaction("books", "readwrite");
  const store = tx.objectStore("books");
  store.put(book);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveLocalChapter(chapter: any) {
  const db = await openDB();
  const tx = db.transaction("chapters", "readwrite");
  const store = tx.objectStore("chapters");
  store.put(chapter);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalBook(id: string): Promise<any> {
  const db = await openDB();
  const tx = db.transaction("books", "readonly");
  const store = tx.objectStore("books");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalChapters(bookId: string): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction("chapters", "readonly");
  const store = tx.objectStore("chapters");
  const index = store.index("bookId");
  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.only(bookId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllLocalBooks(): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction("books", "readonly");
  const store = tx.objectStore("books");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
