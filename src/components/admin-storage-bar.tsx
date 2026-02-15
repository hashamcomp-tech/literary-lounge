
"use client";

import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { HardDrive, Database, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminStorageBar() {
  const db = useFirestore();
  const statsRef = useMemoFirebase(() => doc(db, 'stats', 'storageUsage'), [db]);
  const { data: stats, isLoading } = useDoc(statsRef);

  const usage = stats?.storageBytesUsed || 0;
  const freeLimit = 5 * 1024 * 1024 * 1024; // 5GB free tier
  const percentage = Math.min((usage / freeLimit) * 100, 100);
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const remaining = Math.max(freeLimit - usage, 0);

  return (
    <div className="bg-card/50 backdrop-blur border rounded-2xl p-6 shadow-sm mb-10">
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <Info className="h-4 w-4 text-muted-foreground opacity-50 hover:opacity-100 transition-opacity" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>This estimates storage based on cover image uploads. Total bucket usage might vary slightly.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
        
        <Progress value={percentage} className="h-2 bg-primary/10" />
        
        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter text-muted-foreground opacity-50">
          <span>0 GB</span>
          <span>5 GB Limit</span>
        </div>
      </div>
    </div>
  );
}
