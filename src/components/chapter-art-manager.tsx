'use client';

import { useState, useRef, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { X, Upload, Trash2, Check, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { optimizeCoverImage } from '@/lib/image-utils';

export interface ChapterArt {
  id: string;
  url: string;
  name: string;
  assignedChapters: number[];
  uploadedAt: any;
}

interface ChapterArtManagerProps {
  bookId: string;
  firestore: Firestore;
  currentChapterNum: number;
  onClose: () => void;
  onArtUpdated: (artList: ChapterArt[]) => void;
}

function parseChapterRanges(input: string): number[] {
  const chapters = new Set<number>();
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(s => parseInt(s.trim()));
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) chapters.add(i);
      }
    } else {
      const n = parseInt(part);
      if (!isNaN(n) && n > 0) chapters.add(n);
    }
  }
  return Array.from(chapters).sort((a, b) => a - b);
}

function chaptersToRangeString(chapters: number[]): string {
  if (!chapters.length) return '';
  const sorted = [...chapters].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = sorted[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

export function ChapterArtManager({ bookId, firestore, currentChapterNum, onClose, onArtUpdated }: ChapterArtManagerProps) {
  const [artList, setArtList] = useState<ChapterArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedArt, setSelectedArt] = useState<ChapterArt | null>(null);
  const [assignMode, setAssignMode] = useState<'current' | 'manual' | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('original');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { loadArt(); }, []);

  const loadArt = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(firestore, 'books', bookId, 'chapterArt'));
      const list: ChapterArt[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChapterArt));
      list.sort((a, b) => (a.uploadedAt?.seconds || 0) - (b.uploadedAt?.seconds || 0));
      setArtList(list);
      onArtUpdated(list);
    } catch (e) {
      console.error('Failed to load chapter art', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const optimized = await optimizeCoverImage(file, 1400, selectedAspectRatio);
      const optimizedFile = new File([optimized], file.name, { type: 'image/jpeg' });
      const buffer = await optimizedFile.arrayBuffer();
      const filename = `chapterArt/${bookId}_${Date.now()}.jpg`;
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, { method: 'POST', body: buffer });
      if (!res.ok) throw new Error('Upload failed');
      const blob = await res.json();
      const docRef = await addDoc(collection(firestore, 'books', bookId, 'chapterArt'), {
        url: blob.url,
        name: file.name.replace(/\.[^/.]+$/, ''),
        assignedChapters: [],
        uploadedAt: serverTimestamp(),
      });
      const newArt: ChapterArt = { id: docRef.id, url: blob.url, name: file.name.replace(/\.[^/.]+$/, ''), assignedChapters: [], uploadedAt: null };
      const updated = [...artList, newArt];
      setArtList(updated);
      onArtUpdated(updated);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (art: ChapterArt) => {
    if (!confirm(`Delete "${art.name}"? This will remove it from all assigned chapters.`)) return;
    setDeleting(art.id);
    try {
      await deleteDoc(doc(firestore, 'books', bookId, 'chapterArt', art.id));
      try {
        const { deleteFromVercelBlob } = await import('@/app/actions/upload');
        await deleteFromVercelBlob(art.url);
      } catch {}
      const updated = artList.filter(a => a.id !== art.id);
      setArtList(updated);
      onArtUpdated(updated);
      if (selectedArt?.id === art.id) setSelectedArt(null);
    } catch {
      alert('Failed to delete art.');
    } finally {
      setDeleting(null);
    }
  };

  const handleAssign = async () => {
    if (!selectedArt || !assignMode) return;
    setSaving(true);
    try {
      let chapters: number[] = [];
      if (assignMode === 'current') {
        chapters = Array.from(new Set([...selectedArt.assignedChapters, currentChapterNum]));
      } else {
        const parsed = parseChapterRanges(manualInput);
        if (!parsed.length) { alert('No valid chapters entered.'); setSaving(false); return; }
        chapters = Array.from(new Set([...selectedArt.assignedChapters, ...parsed]));
      }
      chapters.sort((a, b) => a - b);
      await updateDoc(doc(firestore, 'books', bookId, 'chapterArt', selectedArt.id), { assignedChapters: chapters });
      const updated = artList.map(a => a.id === selectedArt.id ? { ...a, assignedChapters: chapters } : a);
      setArtList(updated);
      onArtUpdated(updated);
      setSelectedArt({ ...selectedArt, assignedChapters: chapters });
      setAssignMode(null);
      setManualInput('');
    } catch {
      alert('Failed to save assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnassignCurrent = async (art: ChapterArt) => {
    setSaving(true);
    try {
      const chapters = art.assignedChapters.filter(n => n !== currentChapterNum);
      await updateDoc(doc(firestore, 'books', bookId, 'chapterArt', art.id), { assignedChapters: chapters });
      const updated = artList.map(a => a.id === art.id ? { ...a, assignedChapters: chapters } : a);
      setArtList(updated);
      onArtUpdated(updated);
      setSelectedArt({ ...art, assignedChapters: chapters });
    } catch {}
    setSaving(false);
  };

  const isAssignedToCurrent = (art: ChapterArt) => art.assignedChapters.includes(currentChapterNum);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div>
            <h3 className="font-headline font-black text-xl">Chapter Art Library</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Upload art once, assign to any chapters — visible to all readers</p>
          </div>
          <button onClick={onClose} className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Upload */}
          <div className="px-6 pt-5 pb-4 border-b border-border/30">
          <div className="mb-3">
  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
    {[
      { value: "original", label: "Orig", preview: "aspect-[4/3]" },
      { value: "16:9", label: "16:9", preview: "aspect-video" },
      { value: "4:3", label: "4:3", preview: "aspect-[4/3]" },
      { value: "1:1", label: "1:1", preview: "aspect-square" },
      { value: "3:2", label: "3:2", preview: "aspect-[3/2]" },
      { value: "21:9", label: "21:9", preview: "aspect-[21/9]" },
    ].map((ratio) => {
      const active = selectedAspectRatio === ratio.value;

      return (
        <button
          key={ratio.value}
          type="button"
          onClick={() => setSelectedAspectRatio(ratio.value)}
          className={cn(
            "min-w-[58px] rounded-xl border p-2 flex flex-col items-center gap-1 transition-all shrink-0",
            active
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/40"
          )}
        >
          <div
            className={cn(
              "w-8 bg-muted rounded-sm border border-border",
              ratio.preview
            )}
          />

          <span className="text-[9px] font-bold leading-none">
            {ratio.label}
          </span>
        </button>
      );
    })}
  </div>
</div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-all h-16 flex items-center justify-center gap-3 text-muted-foreground hover:text-foreground"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs font-black uppercase tracking-widest">Uploading...</span></>
                : <><Upload className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Upload New Art to Library</span></>
              }
            </button>
            {uploadError && <p className="text-xs text-destructive mt-2 text-center">{uploadError}</p>}
          </div>

          {/* Grid */}
          <div className="px-6 py-5">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary opacity-30" /></div>
            ) : artList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No art uploaded yet</p>
                <p className="text-xs mt-1 opacity-60">Upload your first image above</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {artList.map(art => {
                  const assigned = isAssignedToCurrent(art);
                  const isSelected = selectedArt?.id === art.id;
                  return (
                    <div
                      key={art.id}
                      onClick={() => { setSelectedArt(isSelected ? null : art); setAssignMode(null); setManualInput(''); }}
                      className={cn(
                        "relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2 aspect-video",
                        isSelected ? "border-primary shadow-lg shadow-primary/20 scale-[1.02]" : "border-transparent hover:border-border"
                      )}
                    >
                      <img src={art.url} alt={art.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex flex-col justify-between p-2">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {assigned && <span className="bg-primary text-primary-foreground text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Ch.{currentChapterNum}</span>}
                          {isSelected && <span className="bg-white text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1"><Check className="h-2.5 w-2.5" />Selected</span>}
                        </div>
                        <div className="flex items-end justify-between gap-1">
                          <div className="min-w-0">
                            {art.assignedChapters.length > 0 && (
                              <span className="block bg-black/60 text-white/80 text-[8px] font-mono px-1.5 py-0.5 rounded mb-1 truncate">
                                {chaptersToRangeString(art.assignedChapters)}
                              </span>
                            )}
                            <p className="text-white text-[10px] font-bold truncate drop-shadow">{art.name}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(art); }}
                            disabled={!!deleting}
                            className="h-6 w-6 shrink-0 rounded-full bg-black/50 hover:bg-red-500 flex items-center justify-center transition-colors"
                          >
                            {deleting === art.id ? <Loader2 className="h-3 w-3 animate-spin text-white" /> : <Trash2 className="h-3 w-3 text-white" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assignment panel */}
          {selectedArt && (
            <div className="mx-6 mb-6 rounded-2xl border border-border bg-muted/20 p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-3">
                <img src={selectedArt.url} alt={selectedArt.name} className="h-12 w-20 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate">{selectedArt.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedArt.assignedChapters.length > 0
                      ? `Assigned: ${chaptersToRangeString(selectedArt.assignedChapters)}`
                      : 'Not assigned to any chapters yet'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setAssignMode(assignMode === 'current' ? null : 'current')}
                  className={cn("px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all",
                    assignMode === 'current' ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50")}
                >
                  {isAssignedToCurrent(selectedArt) ? `✓ Ch.${currentChapterNum} (current)` : `+ Ch.${currentChapterNum} (current)`}
                </button>
                <button
                  onClick={() => setAssignMode(assignMode === 'manual' ? null : 'manual')}
                  className={cn("px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all",
                    assignMode === 'manual' ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50")}
                >
                  Select chapter range
                </button>
                {isAssignedToCurrent(selectedArt) && (
                  <button onClick={() => handleUnassignCurrent(selectedArt)} disabled={saving}
                    className="px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border border-border text-destructive hover:border-destructive transition-all">
                    Remove from ch.{currentChapterNum}
                  </button>
                )}
              </div>

              {assignMode === 'manual' && (
                <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Chapters to assign (e.g. 1-10, 30-45, 60)
                  </label>
                  <input
                    type="text"
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                    placeholder="1-10, 30-45, 60"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                  {manualInput && (
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Preview: {parseChapterRanges(manualInput).join(', ') || 'No valid chapters'}
                    </p>
                  )}
                </div>
              )}

              {assignMode && (
                <Button onClick={handleAssign} disabled={saving || (assignMode === 'manual' && !manualInput.trim())}
                  className="w-full rounded-2xl font-black text-xs uppercase tracking-widest">
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />Saving...</> : 'Confirm Assignment'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
