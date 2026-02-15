import Navbar from '@/components/navbar';
import { CloudReaderClient } from '@/components/cloud-reader-client';

/**
 * @fileOverview Server Component for the Cloud Reader Page.
 * Acts as a shell for the Client Component that handles real-time content fetching.
 * Implements semantic HTML shells for the inner reader content.
 */
interface CloudReaderPageProps {
  params: Promise<{ id: string; chapterNumber: string }>;
}

export default async function CloudReaderPage({ params }: CloudReaderPageProps) {
  const { id, chapterNumber } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <main className="flex-1 container px-4 py-12">
        <CloudReaderClient id={id} chapterNumber={chapterNumber} />
      </main>
    </div>
  );
}
