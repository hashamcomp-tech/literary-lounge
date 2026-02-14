
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Novel } from '@/lib/mock-data';

interface NovelCardProps {
  novel: Novel;
}

export default function NovelCard({ novel }: NovelCardProps) {
  // Determine if this is a cloud novel or mock novel based on ID format
  // Cloud novels use author_title slug, mock uses simple numbers
  const isCloud = isNaN(Number(novel.id));
  const href = isCloud ? `/pages/${novel.id}/1` : `/novel/${novel.id}`;

  return (
    <Link href={href}>
      <Card className="group overflow-hidden border-none shadow-none bg-transparent hover:bg-card/50 transition-colors duration-300">
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl mb-3 shadow-sm group-hover:shadow-md transition-shadow">
            <Image
              src={novel.coverImage || `https://picsum.photos/seed/${novel.id}/400/600`}
              alt={novel.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
              data-ai-hint="book cover"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-primary border-none font-bold">
                Read Now
              </Badge>
            </div>
          </div>
          <div className="px-1">
            <h3 className="font-headline font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors">
              {novel.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-1">{novel.author}</p>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-muted-foreground/30">
                {novel.genre}
              </Badge>
              {isCloud && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold bg-primary/10 text-primary border-none">
                  Cloud
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
