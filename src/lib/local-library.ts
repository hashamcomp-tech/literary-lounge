/**
 * @fileOverview IndexedDB utility for local novel storage.
 */

const DB_NAME = "booksDB";
const DB_VERSION = 1;

/**
 * Opens (or creates) the IndexedDB database for local book storage.
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return;
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;

      // Store for book metadata
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }

      // Store for chapter content, indexed by bookId and chapterNumber
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

/**
 * Saves or updates a book's metadata in the local database.
 */
export async function saveLocalBook(book: any): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");
    const request = store.put(book);
    
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Saves a chapter's content locally.
 */
export async function saveLocalChapter(chapter: any): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chapters", "readwrite");
    const store = tx.objectStore("chapters");
    const request = store.put(chapter);
    
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieves a book by its ID from local storage.
 */
export async function getLocalBook(id: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readonly");
    const store = tx.objectStore("books");
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all chapters associated with a specific book ID.
 */
export async function getLocalChapters(bookId: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chapters", "readonly");
    const store = tx.objectStore("chapters");
    const index = store.index("bookId");
    const request = index.getAll(IDBKeyRange.only(bookId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Returns a list of all books stored in the local library.
 */
export async function getAllLocalBooks(): Promise<any[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readonly");
    const store = tx.objectStore("books");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a book and all its chapters from local storage.
 */
export async function deleteLocalBook(bookId: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["books", "chapters"], "readwrite");
    
    // Delete metadata
    tx.objectStore("books").delete(bookId);
    
    // Delete all chapters
    const chapterStore = tx.objectStore("chapters");
    const index = chapterStore.index("bookId");
    const request = index.openKeyCursor(IDBKeyRange.only(bookId));
    
    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        chapterStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
