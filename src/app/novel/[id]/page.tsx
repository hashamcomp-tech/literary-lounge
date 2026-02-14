import { getNovelById } from '@/lib/mock-data';
import NovelReader from '@/components/novel-reader';
import Navbar from '@/components/navbar';
import { notFound } from 'next/navigation';

export default async function NovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const novel = getNovelById(id);

  if (!novel) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <NovelReader novel={novel} />
    </div>
  );
}