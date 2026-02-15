import Navbar from '@/components/navbar';
import { UploadNovelForm } from '@/components/upload-novel-form';

/**
 * @fileOverview Server Component for the Upload Page.
 * Acts as a shell that renders the Client Component form.
 */
export default function UploadPage() {
  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-headline font-black mb-4">Add Chapter to Library</h1>
            <p className="text-lg text-muted-foreground">
              Expand your private collection or request review for cloud publishing.
            </p>
          </div>
          <UploadNovelForm />
        </div>
      </main>
    </div>
  );
}
