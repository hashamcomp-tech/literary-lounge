
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Eye, Clock, User, Globe, MousePointer2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * @fileOverview Administrative Activity Feed.
 * Exclusive view for Super Admins to monitor site-wide traffic and reader engagement.
 */
export default function AdminActivityPage() {
  const router = useRouter();
  const db = useFirestore();
  const { user } = useUser();
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      const isSuper = user.email === 'hashamcomp@gmail.com';
      setIsAdmin(isSuper);
      if (!isSuper) router.push('/');
    }
  }, [user, router]);

  const logsQuery = useMemoFirebase(() => {
    if (!db || !isAdmin) return null;
    return query(
      collection(db, 'activityLogs'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
  }, [db, isAdmin]);

  const { data: logs, isLoading } = useCollection(logsQuery);

  if (isAdmin === null || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-6xl mx-auto">
          <header className="mb-10">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push('/admin')}
              className="mb-4 -ml-2 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Lounge Control
            </Button>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 uppercase tracking-widest text-[10px]">
                    Intelligence Stream
                  </Badge>
                </div>
                <h1 className="text-5xl font-headline font-black leading-tight">Global Activity</h1>
                <p className="text-muted-foreground text-lg mt-2">Monitoring site movements and reader engagement in real-time.</p>
              </div>
              <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border">
                <div className="flex flex-col items-center px-4 border-r">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Total Events</span>
                  <span className="text-2xl font-headline font-black">{logs?.length || 0}</span>
                </div>
                <div className="flex flex-col items-center px-4">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 border-none font-black h-6">Live</Badge>
                </div>
              </div>
            </div>
          </header>

          <Card className="border-none shadow-2xl bg-card/80 backdrop-blur rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 border-b bg-muted/20">
              <CardTitle className="flex items-center gap-3 text-2xl font-headline font-black">
                <MousePointer2 className="h-6 w-6 text-primary" />
                Audit Trail
              </CardTitle>
              <CardDescription>The last 100 interaction events captured by the Lounge node.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10">
                    <TableHead className="pl-8 font-black uppercase text-[10px] tracking-widest">Time</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Reader</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Destination</TableHead>
                    <TableHead className="pr-8 text-right font-black uppercase text-[10px] tracking-widest">Environment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs?.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-8">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {log.timestamp?.toDate ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                          </span>
                          <span className="text-[9px] text-muted-foreground opacity-60">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${log.isAnonymous ? 'bg-muted' : 'bg-primary/10'}`}>
                            <User className={`h-4 w-4 ${log.isAnonymous ? 'text-muted-foreground' : 'text-primary'}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold truncate max-w-[180px]">{log.email}</span>
                            <span className="text-[9px] font-mono opacity-40">{log.uid}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] bg-background border-primary/10 text-primary px-2 py-0.5">
                            {log.path}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <div className="flex items-center justify-end gap-2 text-muted-foreground opacity-60">
                          <Globe className="h-3 w-3" />
                          <span className="text-[9px] truncate max-w-[150px] font-medium" title={log.userAgent}>
                            {log.userAgent?.split(') ')[0]?.replace('Mozilla/5.0 (', '') || 'Generic Agent'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(!logs || logs.length === 0) && (
                <div className="py-20 text-center">
                  <div className="bg-muted/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed">
                    <Eye className="h-8 w-8 text-muted-foreground opacity-30" />
                  </div>
                  <p className="text-muted-foreground font-medium">No activity data synchronized yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
