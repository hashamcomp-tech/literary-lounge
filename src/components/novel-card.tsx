"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface NovelCardProps {
  novel: any;
}

export default function NovelCard({ novel }: NovelCardProps) {
  // Determine route based on metadata
  const isLocal = novel.isLocalOnly || novel._isLocal;
  // If it's not local, it's either from mock data (numeric IDs) or Firestore
  const isCloud = !isLocal && isNaN(Number(novel.id));
  
  let href = `/novel/${novel.id}`;
  if (isLocal) {
    href = `/local-pages/${novel.id}/1`;
  } else if (isCloud) {
    href = `/pages/${novel.id}/1`;
  }

  const authorName = novel.author || 'Unknown Author';

  return (
    <Link href={href}>
      <Card className="group overflow-hidden border-none shadow-none bg-transparent hover:bg-card/50 transition-colors duration-300">
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl mb-3 shadow-sm group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-500">
            <Image
              src={novel.coverImage || `https://picsum.photos/seed/${novel.id}/400/600`}
              alt={novel.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
              data-ai-hint="book cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <Badge variant="secondary" className="bg-white/95 backdrop-blur-sm text-primary border-none font-bold py-1 px-3">
                Read Now
              </Badge>
            </div>
          </div>
          <div className="px-1">
            <h3 className="font-headline font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors duration-300">
              {novel.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-2 line-clamp-1">By {authorName}</p>
            <div className="flex gap-2 flex-wrap items-center">
              <Badge variant="outline" className="text-[10px] h-5 uppercase tracking-wider font-bold border-muted-foreground/20 text-muted-foreground">
                {novel.genre || 'Novel'}
              </Badge>
              {isCloud && (
                <Badge variant="secondary" className="text-[10px] h-5 uppercase tracking-wider font-bold bg-primary/10 text-primary border-none">
                  Cloud
                </Badge>
              )}
              {isLocal && (
                <Badge variant="secondary" className="text-[10px] h-5 uppercase tracking-wider font-bold bg-amber-100 text-amber-700 border-none">
                  Local Draft
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
