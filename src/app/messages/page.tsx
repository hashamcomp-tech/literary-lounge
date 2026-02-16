
'use client';

import { useState } from 'react';
import Navbar from '@/components/navbar';
import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebase } from '@/firebase';
import { collection, query, limit, where } from 'firebase/firestore';
import { Mail, User, Search, MessageSquare, ShieldCheck, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Messaging Hub (Reader Directory).
 * Allows users to find other readers and start 1:1 conversations.
 */
export default function MessagesPage() {
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const db = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch users for the directory
  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    // Basic discovery: list other users
    return query(
      collection(db, 'users'),
      limit(24)
    );
  }, [db, user]);

  const { data: allUsers, isLoading } = useCollection(usersQuery);

  // Filter users locally based on search
  const filteredUsers = allUsers?.filter(u => 
    u.uid !== user?.uid && 
    (u.username?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isOfflineMode) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 text-center">
          <div className="max-w-md mx-auto space-y-8">
            <div className="bg-amber-500/10 p-10 rounded-[2.5rem] border border-amber-500/20 shadow-xl">
              <Mail className="h-16 w-16 text-amber-600 mx-auto mb-6 opacity-30" />
              <h1 className="text-3xl font-headline font-black mb-4">Direct Messaging Offline</h1>
              <p className="text-muted-foreground leading-relaxed">
                Private messaging requires a cloud connection. Reconnect to message your fellow readers.
              </p>
              <Button 
                className="mt-8 rounded-2xl h-12 px-8 font-bold" 
                variant="outline"
                onClick={() => router.push('/')}
              >
                Back to Library
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isUserLoading && (!user || user.isAnonymous)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 text-center">
          <div className="max-w-md mx-auto space-y-8">
            <div className="bg-primary/5 p-10 rounded-[2.5rem] border border-primary/10 shadow-xl">
              <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-6 opacity-30" />
              <h1 className="text-3xl font-headline font-black mb-4">Identity Required</h1>
              <p className="text-muted-foreground leading-relaxed">
                Please sign in to start private conversations with other readers in the Lounge.
              </p>
              <Button 
                className="mt-8 rounded-2xl h-12 px-10 font-black uppercase text-xs tracking-widest bg-primary shadow-lg shadow-primary/20"
                onClick={() => router.push('/login')}
              >
                Sign In
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-primary/10 p-2 rounded-xl">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase tracking-[0.2em] text-[10px] px-3 font-black">
                Reader Directory
              </Badge>
            </div>
            <h1 className="text-5xl font-headline font-black leading-none mb-6">Messages</h1>
            
            <div className="relative max-w-md">
              <Input 
                placeholder="Search by username..." 
                className="h-12 pl-12 rounded-2xl bg-muted/30 border-none shadow-inner focus:bg-background transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            </div>
          </header>

          {isLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {filteredUsers.map((u) => (
                <Card 
                  key={u.uid} 
                  className="group border-none shadow-sm hover:shadow-xl bg-card/50 backdrop-blur transition-all duration-500 cursor-pointer overflow-hidden rounded-[2rem]"
                  onClick={() => router.push(`/messages/${u.uid}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                        <AvatarFallback className="bg-primary/10 text-primary font-black uppercase">
                          {u.username?.substring(0, 2) || <User className="h-6 w-6" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-headline font-bold text-lg truncate group-hover:text-primary transition-colors">
                          {u.username || 'Reader'}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        Send Message →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed">
              <User className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-10" />
              <p className="text-muted-foreground font-medium">No other readers found matching your search.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
