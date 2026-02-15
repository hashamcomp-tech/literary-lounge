
'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, MessageSquare, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface ChatInterfaceProps {
  chatId: string;
  title: string;
}

export default function ChatInterface({ chatId, title }: ChatInterfaceProps) {
  const db = useFirestore();
  const { user } = useUser();
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Real-time message subscription
  const messagesQuery = useMemoFirebase(() => {
    if (!db || !chatId) return null;
    return query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );
  }, [db, chatId]);

  const { data: messages, isLoading } = useCollection(messagesQuery);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !db) return;

    const text = inputText.trim();
    setInputText('');

    try {
      // Non-blocking mutation pattern
      addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName || user.email?.split('@')[0] || 'Reader',
        text: text,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Chat error:", error);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-3xl bg-card/50 backdrop-blur shadow-xl overflow-hidden">
      <header className="p-6 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-headline font-bold">{title} Lounge</h3>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Live Discussion</p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-lg border-primary/20 text-primary bg-primary/5">
          {messages?.length || 0} Messages
        </Badge>
      </header>

      <ScrollArea className="flex-1 p-6">
        <div className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
            </div>
          ) : messages && messages.length > 0 ? (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.uid;
              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}
                >
                  <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground/60">
                      {msg.senderName}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40">
                      {msg.timestamp?.toDate ? formatDistanceToNow(msg.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                    </span>
                  </div>
                  <div 
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      isMe 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-muted/80 text-foreground rounded-tl-none border border-border/50'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center opacity-30 flex flex-col items-center">
              <MessageSquare className="h-10 w-10 mb-2" />
              <p className="text-sm font-medium">Be the first to start the conversation.</p>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSendMessage} className="p-4 border-t bg-muted/20 flex gap-2">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Share your thoughts..."
          className="rounded-2xl h-12 bg-background/50 border-none shadow-inner"
        />
        <Button 
          type="submit" 
          disabled={!inputText.trim()} 
          size="icon" 
          className="h-12 w-12 rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
