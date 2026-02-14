"use client";

import Link from 'next/link';
import { Search, User, BookOpen, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary p-1.5 rounded-lg transition-transform group-hover:scale-110">
            <BookOpen className="text-primary-foreground h-6 w-6" />
          </div>
          <span className="text-xl font-headline font-bold hidden sm:inline-block">Literary Lounge</span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-md relative group">
          <Input
            type="search"
            placeholder="Search novels, authors, or genres..."
            className="pl-10 h-10 bg-muted/50 border-transparent transition-all group-focus-within:bg-background group-focus-within:border-primary/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </form>

        <div className="flex items-center gap-2">
          <Link href="/setup">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}