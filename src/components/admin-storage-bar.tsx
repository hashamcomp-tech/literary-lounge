
"use client";

import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { HardDrive, Database, Info, RefreshCw } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminStorageBar() {
  const db = useFirestore();
  const statsRef = useMemoFirebase(() => db ? doc(db, 'stats', 'storageUsage') : null, [db]);
  const { data: stats, isLoading } = useDoc(statsRef);

  // If the document doesn't exist, used bytes is effectively 0
  const usage = stats?.storageBytesUsed ?? 0;
  const freeLimit = 5 * 1024 * 1024 * 1024; // 5GB free tier
  
  // Ensure we have a visible percentage even for very small uploads
  const rawPercentage = (usage / freeLimit) * 100;
  const percentage = usage > 0 ? Math.max(rawPercentage, 0.5) : 0;
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const remaining = Math.max(freeLimit - usage, 0);

  return (
    <div className="bg-card/50 backdrop-blur border rounded-2xl p-6 shadow-sm mb-10 group transition-all hover:bg-card/80">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Cloud Storage</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Firebase Free Tier</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLoading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground opacity-50" />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <Info className="h-4 w-4 text-muted-foreground opacity-50 hover:opacity-100 transition-opacity" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4 rounded-xl border-none shadow-2xl">
                <p className="text-xs leading-relaxed">
                  This bar tracks the total volume of cover images and user photos in the cloud. 
                  If this doesn't move after an upload, visit <strong>Intelligence</strong> to repair the counter.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <div className="space-y-3">
        <div className="flex justify-between items-end">
          <span className="text-2xl font-headline font-black text-primary">
            {isLoading ? "---" : formatBytes(usage)}
          </span>
          <span className="text-xs font-bold text-muted-foreground">
            {formatBytes(remaining)} remaining
          </span>
        </div>
        
        <div className="relative">
          <Progress value={percentage} className="h-2 bg-primary/10" />
          {isLoading && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent animate-shimmer" />
          )}
        </div>
        
        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter text-muted-foreground opacity-50">
          <span>0 GB</span>
          <span>5 GB Limit</span>
        </div>
      </div>
    </div>
  );
}
