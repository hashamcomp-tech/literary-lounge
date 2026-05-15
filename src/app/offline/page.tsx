import Link from 'next/link';

export const metadata = { title: 'Literary Lounge – Offline' };

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl mb-6">📚</div>
      <h1 className="text-3xl font-bold mb-3">You&apos;re Offline</h1>
      <p className="text-muted-foreground max-w-sm leading-relaxed mb-2">
        No internet connection right now.
      </p>
      <p className="text-muted-foreground max-w-sm leading-relaxed mb-8">
        Your <strong className="text-foreground">Local Library</strong> is still fully
        available — any books you&apos;ve downloaded are ready to read.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity"
      >
        Go to My Library
      </Link>
      <p className="mt-8 text-xs text-muted-foreground max-w-xs leading-relaxed">
        Once you&apos;re back online, Literary Lounge will sync automatically.
      </p>
    </div>
  );
}
