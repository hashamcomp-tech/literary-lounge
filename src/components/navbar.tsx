"use client";

import Link from 'next/link';
import { Search, User, BookOpen, Settings, Upload, Shield, History, HelpCircle, SlidersHorizontal, WifiOff, CloudOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebase, useCollection } from '@/firebase';
import { doc, collection, query } from 'firebase/firestore';
import { ModeToggle } from '@/components/mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function Navbar() {
  const router = useRouter();
  const db = useFirestore();
  const { isOfflineMode } = useFirebase();
  const [searchQuery, setSearchQuery] = useState('');
  const { user, isUserLoading } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user || user.isAnonymous || isUserLoading) return null;
    return doc(db, 'users', user.uid);
  }, [db, user, isUserLoading]);

  const { data: profile } = useDoc(profileRef);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (isOfflineMode || !db || !user || isUserLoading) {
        setIsAdmin(false);
        return;
      }
      if (user.email === 'hashamcomp@gmail.com' || profile?.role === 'admin') {
        setIsAdmin(true);
        return;
      }
      setIsAdmin(false);
    };
    checkAdminStatus();
  }, [user, profile, db, isUserLoading, isOfflineMode]);

  // Real-time listener for new cloud requests (notifications for admins)
  const requestsQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return collection(db, 'cloudUploadRequests');
  }, [db, isAdmin, isOfflineMode]);

  const { data: requests } = useCollection(requestsQuery);
  const hasNewRequests = requests && requests.length > 0;

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

        <form onSubmit={handleSearch} className="flex-1 max-w-md relative group">
          <Input
            type="search"
            placeholder="Search novels or authors..."
            className="pl-10 h-10 bg-muted/50 border-transparent transition-all group-focus-within:bg-background group-focus-within:border-primary/30 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </form>

        <div className="flex items-center gap-1 sm:gap-2">
          <TooltipProvider>
            {isOfflineMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="px-3 py-1 bg-amber-500/10 text-amber-700 rounded-full flex items-center gap-2 border border-amber-500/20 mr-2 hidden md:flex cursor-help">
                    <WifiOff className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Independent Mode</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cloud connection unavailable. Using local data only.</p>
                </TooltipContent>
              </Tooltip>
            )}

            <div className="flex items-center gap-1">
              {isAdmin && !isOfflineMode ? (
                <Link href="/admin">
                  <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/10 rounded-full relative" title="Admin Dashboard">
                    <Shield className="h-5 w-5" />
                    {hasNewRequests && (
                      <span className="absolute top-2 right-2 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                  </Button>
                </Link>
              ) : null}
              
              <Link href="/upload">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary rounded-full" title="Upload Novel">
                  <Upload className="h-5 w-5" />
                </Button>
              </Link>
              
              <ModeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary rounded-full" title="Settings">
                    <Settings className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-xl border shadow-xl">
                  <DropdownMenuLabel className="font-headline font-bold">Lounge Settings</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/setup">
                    <DropdownMenuItem className="rounded-lg cursor-pointer py-2.5">
                      <SlidersHorizontal className="mr-2 h-4 w-4 text-primary" />
                      <span>Reading Preferences</span>
                    </DropdownMenuItem>
                  </Link>
                  
                  <Link href="/history">
                    <DropdownMenuItem 
                      className={`rounded-lg cursor-pointer py-2.5 ${isOfflineMode ? 'opacity-50' : ''}`}
                    >
                      <History className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>Reading History</span>
                        {isOfflineMode && <span className="text-[9px] font-black text-amber-600 uppercase">Cloud Sync Offline</span>}
                      </div>
                    </DropdownMenuItem>
                  </Link>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="rounded-lg cursor-pointer py-2.5">
                    <HelpCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>Help & Support</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {!isOfflineMode ? (
                <Link href="/login">
                  <Button variant="ghost" size="icon" className="p-0 hover:bg-transparent rounded-full overflow-hidden" title="Account">
                    {isLoggedIn && profile?.photoURL ? (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile.photoURL} />
                        <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    ) : (
                      <User className={`h-5 w-5 ${isLoggedIn ? 'text-primary' : 'text-muted-foreground'}`} />
                    )}
                  </Button>
                </Link>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground opacity-50 rounded-full cursor-not-allowed">
                      <CloudOff className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sign-in unavailable in Independent Mode</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </nav>
  );
}
