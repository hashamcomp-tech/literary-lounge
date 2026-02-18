/**
 * @fileOverview Utility for managing minimal book metadata in localStorage.
 * This allows unlogged users to see their reading history without a cloud sync.
 */

export interface LocalHistoryItem {
  id: string;
  title: string;
  author: string;
  coverURL: string | null;
  genre: string | string[];
  lastReadChapter: number;
  lastReadAt: string;
  isCloud: boolean;
}

const HISTORY_KEY = 'lounge-recent-history';
const MAX_HISTORY = 12;

export function saveToLocalHistory(item: LocalHistoryItem) {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    let history: LocalHistoryItem[] = raw ? JSON.parse(raw) : [];

    // Remove existing entry for this book
    history = history.filter(h => h.id !== item.id);

    // Add to front
    history.unshift(item);

    // Limit size
    history = history.slice(0, MAX_HISTORY);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Failed to save local history", e);
  }
}

export function getLocalHistory(): LocalHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
