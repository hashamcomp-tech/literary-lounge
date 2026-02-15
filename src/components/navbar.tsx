
"use client";

import Link from 'next/link';
import { Search, User, BookOpen, Settings, Upload, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function Navbar() {
  const router = useRouter();
  const db = useFirestore();
  const [searchQuery, setSearchQuery] = useState('');
  const { user, isUserLoading } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);

  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user || user.isAnonymous || !user.email) {
        setIsAdmin(false);
        return;
      }
      
      // Super-admin bypass or explicit admin role
      if (user.email === 'hashamcomp@gmail.com' || profile?.role === 'admin') {
        setIsAdmin(true);
        return;
      }
      
      try {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const emails = snap.data().emails || [];
          setIsAdmin(emails.includes(user.email));
        }
      } catch (e) {}
    };
    checkAdmin();
  }, [user, profile, db]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const isLoggedIn = user && !user.isAnonymous;

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary p-1.5 rounded-lg transition-transform group-hover:scale-110">
            <BookOpen className="text-primary-foreground h-6 w-6" />
          </div>
          <span className="text-xl font-headline font-bold hidden sm:inline-block">Literary Lounge</span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1-max-w-md relative group">
          <Input
            type="search"
            placeholder="Search novels or authors..."
            className="pl-10 h-10 bg-muted/50 border-transparent transition-all group-focus-within:bg-background group-focus-within:border-primary/30 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </form>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin">
              <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/10 rounded-full" title="Admin Dashboard">
                <Shield className="h-5 w-5" />
              </Button>
            </Link>
          )}
          <Link href="/upload">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary rounded-full" title="Upload Novel">
              <Upload className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/setup">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary rounded-full" title="Preferences">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="icon" className={`${isLoggedIn ? 'text-primary' : 'text-muted-foreground'} hover:text-primary rounded-full`} title="Account">
              <User className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
