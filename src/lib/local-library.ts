
/**
 * @fileOverview Local novel storage engine using idb-keyval.
 * Provides a simple, high-performance interface for browser-based archiving.
 */
import { set, get, values, del, update } from "idb-keyval";

/**
 * Saves or updates a book's metadata in the local archive.
 */
export async function saveLocalBook(book: any): Promise<void> {
  const books: any[] = await get("lounge-books") || [];
  const index = books.findIndex(b => b.id === book.id);
  
  if (index !== -1) {
    books[index] = { ...books[index], ...book };
  } else {
    books.push(book);
  }
  
  await set("lounge-books", books);
}

/**
 * Saves a chapter's content locally.
 */
export async function saveLocalChapter(chapter: {
  bookId: string;
  chapterNumber: number;
  content: string;
  title?: string;
}): Promise<void> {
  const key = `lounge-chapters-${chapter.bookId}`;
  const chapters: any[] = await get(key) || [];
  
  const index = chapters.findIndex(c => c.chapterNumber === chapter.chapterNumber);
  if (index !== -1) {
    chapters[index] = chapter;
  } else {
    chapters.push(chapter);
  }
  
  await set(key, chapters);
}

/**
 * Saves local reading progress.
 */
export async function saveLocalProgress(novelId: string, chapterNumber: number): Promise<void> {
  await set(`lounge-progress-${novelId}`, {
    chapterNumber,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Retrieves a book by its ID from local storage.
 */
export async function getLocalBook(id: string): Promise<any> {
  const books: any[] = await get("lounge-books") || [];
  return books.find(b => b.id === id);
}

/**
 * Retrieves all chapters associated with a specific book ID.
 */
export async function getLocalChapters(bookId: string): Promise<any[]> {
  return await get(`lounge-chapters-${bookId}`) || [];
}

/**
 * Returns a list of all books stored in the local library.
 */
export async function getAllLocalBooks(): Promise<any[]> {
  return await get("lounge-books") || [];
}

/**
 * Deletes a book and all its chapters from local storage.
 */
export async function deleteLocalBook(bookId: string): Promise<void> {
  const books: any[] = await get("lounge-books") || [];
  const updatedBooks = books.filter(b => b.id !== bookId);
  await set("lounge-books", updatedBooks);
  
  await del(`lounge-chapters-${bookId}`);
  await del(`lounge-progress-${bookId}`);
}
