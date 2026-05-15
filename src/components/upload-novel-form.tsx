"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
Card,
CardContent,
CardHeader,
CardTitle,
CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
Globe,
HardDrive,
FileText,
X,
Sparkles,
Book,
Search,
CloudUpload,
Loader2,
} from "lucide-react";
import {
doc,
getDoc,
setDoc,
serverTimestamp,
collection,
getDocs,
} from "firebase/firestore";
import { useFirebase } from "@/firebase/provider";
import { useToast } from "@/hooks/use-toast";
import {
saveLocalBook,
saveLocalChapter,
getAllLocalBooks,
setUserPreference,
getUserPreference,
} from "@/lib/local-library";
import { GENRES, ALL_GENRES } from "@/lib/genres";
import { uploadBookToCloud, cleanContent } from "@/lib/upload-book";
import { Badge } from "@/components/ui/badge";
import {
Popover,
PopoverContent,
PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import JSZip from "jszip";
interface Suggestion {
id: string;
title: string;
author: string;
totalChapters: number;
genre: string[];
}
/**
* @fileOverview Universal Manuscript Ingestion Form.
* Features a refined 3-line paste detection system restricted to existing series.
* Remembers user preferences for Upload Mode and Source Mode.
* Defaults to Cloud and Paste Text for the Super Admin.
*/
export function UploadNovelForm() {
const router = useRouter();
const { firestore: db, storage, user, isOfflineMode, isUserLoading } =
useFirebase();
const { toast } = useToast();
const [uploadMode, setUploadMode] = useState<"cloud" | "local">("local");
const [sourceMode, setSourceMode] = useState<"file" | "text">("file");
const [preferencesLoaded, setPreferencesLoaded] = useState(false);
const [title, setTitle] = useState("");
const [author, setAuthor] = useState("");
const [chapterNumber, setChapterNumber] = useState("1");
const [chapterTitle, setChapterTitle] = useState("");
const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [pastedText, setPastedText] = useState("");
const [loading, setLoading] = useState(false);
const [loadingMessage, setLoadingMessage] = useState("");
const [canUploadCloud, setCanUploadCloud] = useState<boolean>(false);
const [wasAutoFilled, setWasAutoFilled] = useState(false);
const [allBooks, setAllBooks] = useState<Suggestion[]>([]);
// FIX #4: Keep a ref in sync with allBooks so paste detection always reads
// the latest library even if the state update hasn't propagated yet.
const allBooksRef = useRef<Suggestion[]>([]);
const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>(
[]
);
const [showSuggestions, setShowSuggestions] = useState(false);
const suggestionRef = useRef<HTMLDivElement>(null);
// ─── Load persisted preferences ───────────────────────────────────────────
useEffect(() => {
const loadPrefs = async () => {
const savedUploadMode = await getUserPreference("uploadMode");
const savedSourceMode = await getUserPreference("sourceMode");
const isSuperAdmin = user?.email === "hashamcomp@gmail.com";
if (savedUploadMode) {
setUploadMode(savedUploadMode);
} else if (isSuperAdmin) {
setUploadMode("cloud");
} else {
setUploadMode("local");
}
if (savedSourceMode) {
setSourceMode(savedSourceMode);
} else if (isSuperAdmin) {
setSourceMode("text");
} else {
setSourceMode("file");
}
setPreferencesLoaded(true);
};
if (!isUserLoading) {
loadPrefs();
}
}, [user, isUserLoading]);
// ─── Persist mode changes ─────────────────────────────────────────────────
const handleSetUploadMode = (mode: "cloud" | "local") => {
setUploadMode(mode);
setUserPreference("uploadMode", mode);
};
const handleSetSourceMode = (mode: "file" | "text") => {
setSourceMode(mode);
setUserPreference("sourceMode", mode);
};
// ─── Paste detection ──────────────────────────────────────────────────────
// FIX #4: Read from ref so the closure always has the latest book list.
const processManuscriptPaste = (rawText: string) => {
const lines = rawText.split("\n");
const contentLines: { text: string; index: number }[] = [];
for (let i = 0; i < lines.length; i++) {
if (lines[i].trim()) {
contentLines.push({ text: lines[i].trim(), index: i });
if (contentLines.length === 3) break;
}
}
if (contentLines.length < 1) return;
const possibleTitle = contentLines[0].text;
// FIX #4: use ref instead of stale closure over allBooks state
const existing = allBooksRef.current.find(
(b) => b.title.toLowerCase() === possibleTitle.toLowerCase()
);
// FIX #3: Inform the user when no matching series is found instead of
// silently returning. Still populate pastedText with the raw content.
if (!existing) {
setPastedText(rawText);
toast({
title: "No Series Match",
description:
"Couldn't match the first line to an existing series. Fields were not auto-filled —
});
return;
}
let linesToRemove: number[] = [contentLines[0].index];
setTitle(existing.title);
setAuthor(existing.author);
setSelectedGenres(existing.genre);
if (contentLines.length >= 2) {
const line2 = contentLines[1].text;
const chMatch = line2.match(/chapter\s+(\d+)/i);
if (chMatch) {
const num = chMatch[1];
setChapterNumber(num);
const name = line2
.replace(new RegExp(`chapter\\s+${num}`, "i"), "")
.replace(/^[\s:—–-]+/, "")
.replace(/[\s:—–-]+$/, "")
.replace(/^\d+[\s.:—–-]*/, "")
.trim();
setChapterTitle(name);
linesToRemove.push(contentLines[1].index);
}
}
if (contentLines.length >= 3) {
const line3 = contentLines[2].text;
if (line3.startsWith("[") && line3.toLowerCase().includes("words")) {
linesToRemove.push(contentLines[2].index);
}
}
const cleanedBody = lines
.filter((_, idx) => !linesToRemove.includes(idx))
.join("\n")
.trim();
setPastedText(cleanedBody);
setWasAutoFilled(true);
toast({
title: "Series Linked",
description: `Detected metadata for "${existing.title}". Fields auto-filled and headers
});
};
// ─── Fetch library index ──────────────────────────────────────────────────
useEffect(() => {
const fetchLibraryIndex = async () => {
try {
if (uploadMode === "cloud" && db) {
const snap = await getDocs(collection(db, "books"));
// FIX #7: Rename the map parameter to avoid shadowing the imported
// `doc` function from firebase/firestore.
const books = snap.docs.map((docSnap) => {
const data = docSnap.data();
return {
id: docSnap.id,
title: data.title || data.metadata?.info?.bookTitle || "",
author: data.author || data.metadata?.info?.author || "",
totalChapters: data.metadata?.info?.totalChapters || 0,
genre: data.genre || data.metadata?.info?.genre || [],
};
});
setAllBooks(books);
// FIX #4: keep ref in sync
allBooksRef.current = books;
} else {
const local = await getAllLocalBooks();
const books = local.map((b) => ({
id: b.id,
title: b.title,
author: b.author,
totalChapters: b.totalChapters || 0,
genre: Array.isArray(b.genre) ? b.genre : [b.genre],
}));
setAllBooks(books);
// FIX #4: keep ref in sync
allBooksRef.current = books;
}
} catch (e) {
console.error(e);
}
};
fetchLibraryIndex();
}, [uploadMode, db]);
// ─── Title autocomplete filter ────────────────────────────────────────────
useEffect(() => {
const trimmed = title.trim();
if (trimmed.length < 2) {
setFilteredSuggestions([]);
setShowSuggestions(false);
return;
}
const exactMatch = allBooks.find(
(b) => b.title === trimmed && author === b.author
);
if (exactMatch) {
setShowSuggestions(false);
return;
}
const filtered = allBooks.filter((b) =>
b.title.toLowerCase().includes(trimmed.toLowerCase())
);
setFilteredSuggestions(filtered);
setShowSuggestions(filtered.length > 0);
}, [title, allBooks, author]);
// ─── Select novel from suggestions ───────────────────────────────────────
const selectNovel = (book: Suggestion) => {
setTitle(book.title);
setAuthor(book.author);
setSelectedGenres(book.genre);
setChapterNumber((book.totalChapters + 1).toString());
setShowSuggestions(false);
toast({
title: "Metadata Synced",
description: `Linked to existing series: ${book.title}`,
});
};
// ─── Permission check ─────────────────────────────────────────────────────
// FIX #1 + #2: Removed `uploadMode` from the dependency array — it caused a
// re-run on every mode change, creating a feedback loop. Also, we now guard
// on `preferencesLoaded` before acting on uploadMode so we don't force a
// reset to "local" before the user's saved preference has been applied.
useEffect(() => {
if (isOfflineMode || !db || !user || user.isAnonymous) {
setCanUploadCloud(false);
// Only override the mode once we know the user's saved preference.
if (preferencesLoaded) {
setUploadMode("local");
}
return;
}
const checkPermissions = async () => {
const pRef = doc(db, "users", user.uid);
const snap = await getDoc(pRef);
const data = snap.data();
const permitted =
user.email === "hashamcomp@gmail.com" || data?.role === "admin";
setCanUploadCloud(permitted);
// Only downgrade the mode if preferences have already been applied so
// we don't race against the preference-loading effect.
if (!permitted && preferencesLoaded) {
setUploadMode("local");
}
};
checkPermissions();
// FIX #1: `uploadMode` intentionally omitted — permission doesn't depend
// on which mode the user has currently selected.
}, [user, db, isOfflineMode, preferencesLoaded]);
// ─── Submit handler ───────────────────────────────────────────────────────
const handleUpload = async (e: React.FormEvent) => {
e.preventDefault();
if (!title.trim() || !author.trim()) return;
// FIX #6: Validate chapterNumber before proceeding.
const chNum = parseInt(chapterNumber, 10);
if (isNaN(chNum) || chNum < 1) {
toast({
variant: "destructive",
title: "Invalid Chapter Number",
description: "Please enter a valid chapter number (1 or higher).",
});
return;
}
// FIX #5: Guard against file mode with no file selected.
if (sourceMode === "file" && !selectedFile) {
toast({
variant: "destructive",
title: "No File Selected",
description: "Please select a file to upload.",
});
return;
}
setLoading(true);
setLoadingMessage("Processing volume...");
try {
const searchTitle = title.trim();
const existingBook = allBooks.find(
(b) => b.title.trim().toLowerCase() === searchTitle.toLowerCase()
);
const bookId =
existingBook?.id ||
`${Date.now()}_${searchTitle.replace(/\s+/g, "_")}`;
let preParsedChapters: { title: string; content: string }[] | undefined =
undefined;
let manualContent: string | undefined = undefined;
if (sourceMode === "file" && selectedFile) {
if (selectedFile.name.toLowerCase().endsWith(".epub")) {
setLoadingMessage("Parsing Archive...");
const zip = await JSZip.loadAsync(selectedFile);
const containerXml = await zip
.file("META-INF/container.xml")
?.async("string");
const parser = new DOMParser();
const containerDoc = parser.parseFromString(
containerXml || "",
"text/xml"
);
const opfPath =
containerDoc
.querySelector("rootfile")
?.getAttribute("full-path") || "";
const opfDir = opfPath.includes("/")
? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
: "";
const opfXml = (await zip.file(opfPath)?.async("string")) || "";
const opfDoc = parser.parseFromString(opfXml, "text/xml");
const manifest: Record<string, string> = {};
opfDoc.querySelectorAll("manifest item").forEach((item) => {
const id = item.getAttribute("id");
const href = item.getAttribute("href");
if (id && href) manifest[id] = href;
});
// Build a title map from the EPUB nav document (EPUB3) or NCX (EPUB2).
const tocTitles: Record<string, string> = {};
const navId = Array.from(
opfDoc.querySelectorAll("manifest item")
).find(
(i) =>
i.getAttribute("properties")?.includes("nav") ||
(i.getAttribute("media-type") === "application/xhtml+xml" &&
i.getAttribute("href")?.includes("nav"))
)?.getAttribute("id");
if (navId && manifest[navId]) {
const navPath = opfDir + manifest[navId];
const navXml = (await zip.file(navPath)?.async("string")) || "";
const navDoc = parser.parseFromString(navXml, "text/html");
navDoc.querySelectorAll("nav a, nav li a").forEach((a) => {
const href = (a as HTMLAnchorElement)
.getAttribute("href")
?.split("#")[0];
const label = a.textContent?.trim();
if (href && label) tocTitles[href] = label;
});
}
// Determine spine order from the OPF manifest + spine elements.
const spineIds: string[] = [];
opfDoc.querySelectorAll("spine itemref").forEach((itemref) => {
const idref = itemref.getAttribute("idref");
if (idref) spineIds.push(idref);
});
// FIX #8: Actually extract chapter content instead of leaving the
// array empty. Walk the spine, parse each XHTML document, extract
// its text, and collect it as a chapter.
const chapters: { title: string; content: string }[] = [];
for (const spineId of spineIds) {
const href = manifest[spineId];
if (!href) continue;
const filePath = opfDir + href;
const xhtml = await zip.file(filePath)?.async("string");
if (!xhtml) continue;
const chapterDoc = parser.parseFromString(xhtml, "text/html");
// Strip script / style nodes for clean text extraction.
chapterDoc
.querySelectorAll("script, style")
.forEach((el) => el.remove());
const rawText =
chapterDoc.body?.textContent?.trim() ?? "";
if (!rawText) continue;
// Use the ToC title if we have one, otherwise fall back to the
// document's own <title> or a numbered placeholder.
const hrefKey = href.split("/").pop() || href;
const chapterName =
tocTitles[hrefKey] ||
tocTitles[href] ||
chapterDoc.querySelector("title")?.textContent?.trim() ||
`Chapter ${chapters.length + 1}`;
chapters.push({ title: chapterName, content: rawText });
}
if (chapters.length === 0) {
throw new Error(
"Could not extract any chapters from the EPUB file. " +
"The file may be DRM-protected or use an unsupported format."
);
}
preParsedChapters = chapters;
} else {
// Plain text / markdown file — treat as a single chapter.
manualContent = await selectedFile.text();
}
} else {
// Text paste mode.
manualContent = pastedText;
}
if (uploadMode === "cloud") {
if (!canUploadCloud) throw new Error("Cloud publishing restricted.");
if (!db || !storage || !user) {
throw new Error("Firebase services unavailable.");
}
await uploadBookToCloud({
db,
storage,
bookId,
title: searchTitle,
author: author.trim(),
genres: selectedGenres,
rawContent: manualContent,
ownerId: user.uid,
manualChapterInfo: manualContent
? { number: chNum, title: chapterTitle.trim() }
: undefined,
preParsedChapters,
});
} else {
// ── Local / archive path ────────────────────────────────────────────
await saveLocalBook({
id: bookId,
title: searchTitle,
author: author.trim(),
genre: selectedGenres,
totalChapters: preParsedChapters
? preParsedChapters.length
: chNum,
isCloud: false,
});
if (preParsedChapters && preParsedChapters.length > 0) {
for (let i = 0; i < preParsedChapters.length; i++) {
await saveLocalChapter({
bookId,
chapterNumber: i + 1,
title: preParsedChapters[i].title,
content: cleanContent(preParsedChapters[i].content),
});
}
} else if (manualContent) {
await saveLocalChapter({
bookId,
chapterNumber: chNum,
title: chapterTitle.trim(),
content: cleanContent(manualContent),
});
} else {
throw new Error("No content to save.");
}
}
toast({
title: "Success",
description: "Volume integrated into library.",
});
router.push("/");
} catch (err: any) {
toast({
variant: "destructive",
title: "Error",
description: err.message,
});
} finally {
setLoading(false);
}
};
// ─── Render ───────────────────────────────────────────────────────────────
return (
<div className="space-y-6 max-w-xl mx-auto pb-20">
<Card className="border-none shadow-2xl bg-card/80 backdrop-blur rounded-[2.5rem] overf
<div className="h-2 bg-primary w-full" />
<CardHeader>
<div className="flex justify-between items-center">
<div>
<CardTitle className="text-3xl font-headline font-black">
Add Volume
</CardTitle>
<CardDescription>Expand your library collection.</CardDescription>
</div>
<div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl">
<Button
size="sm"
variant={uploadMode === "cloud" ? "default" : "ghost"}
className="rounded-lg h-8 text-[10px] font-black uppercase px-3"
onClick={() => handleSetUploadMode("cloud")}
disabled={!canUploadCloud}
>
<Globe className="h-3 w-3 mr-1.5" /> Cloud
</Button>
<Button
size="sm"
variant={uploadMode === "local" ? "default" : "ghost"}
className="rounded-lg h-8 text-[10px] font-black uppercase px-3"
onClick={() => handleSetUploadMode("local")}
>
<HardDrive className="h-3 w-3 mr-1.5" /> Archive
</Button>
</div>
</div>
</CardHeader>
<CardContent className="space-y-6">
<form onSubmit={handleUpload} className="space-y-5">
{/* Title with autocomplete */}
<div className="space-y-1.5 relative">
<Label htmlFor="title">Title</Label>
<div className="relative">
<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mute
<Input
id="title"
value={title}
onChange={(e) => setTitle(e.target.value)}
placeholder="Novel title"
className="pl-9"
autoComplete="off"
/>
</div>
{showSuggestions && (
<div
ref={suggestionRef}
className="absolute z-50 w-full mt-1 bg-popover border rounded-xl shadow-lg
>
<ScrollArea className="max-h-48">
{filteredSuggestions.map((book) => (
<button
key={book.id}
type="button"
className="w-full text-left px-4 py-2.5 hover:bg-accent transition-co
onClick={() => selectNovel(book)}
>
<p className="text-sm font-semibold">{book.title}</p>
<p className="text-xs text-muted-foreground">
{book.author} · Ch {book.totalChapters}
</p>
</button>
))}
</ScrollArea>
</div>
)}
</div>
{/* Author */}
<div className="space-y-1.5">
<Label htmlFor="author">Author</Label>
<Input
id="author"
value={author}
onChange={(e) => setAuthor(e.target.value)}
placeholder="Author name"
/>
</div>
{/* Chapter number + title */}
<div className="grid grid-cols-2 gap-3">
<div className="space-y-1.5">
<Label htmlFor="chapterNumber">Chapter #</Label>
<Input
id="chapterNumber"
type="number"
min={1}
value={chapterNumber}
onChange={(e) => setChapterNumber(e.target.value)}
placeholder="1"
/>
</div>
<div className="space-y-1.5">
<Label htmlFor="chapterTitle">Chapter Title</Label>
<Input
id="chapterTitle"
value={chapterTitle}
onChange={(e) => setChapterTitle(e.target.value)}
placeholder="Optional"
/>
</div>
</div>
{/* Genre picker */}
<div className="space-y-1.5">
<Label>Genres</Label>
<Popover>
<PopoverTrigger asChild>
<Button
type="button"
variant="outline"
className="w-full justify-start font-normal"
>
<Book className="h-4 w-4 mr-2 text-muted-foreground" />
{selectedGenres.length > 0
? selectedGenres.join(", ")
: "Select genres…"}
</Button>
</PopoverTrigger>
<PopoverContent className="w-72 p-2" align="start">
<ScrollArea className="h-56">
<div className="flex flex-wrap gap-1.5 p-1">
{ALL_GENRES.map((genre) => (
<Badge
key={genre}
variant={
selectedGenres.includes(genre)
? "default"
: "outline"
}
className="cursor-pointer"
onClick={() =>
setSelectedGenres((prev) =>
prev.includes(genre)
? prev.filter((g) => g !== genre)
: [...prev, genre]
)
}
>
{genre}
</Badge>
))}
</div>
</ScrollArea>
</PopoverContent>
</Popover>
</div>
{/* Source mode: file vs paste */}
<Tabs
value={sourceMode}
onValueChange={(v) =>
handleSetSourceMode(v as "file" | "text")
}
>
<TabsList className="w-full">
<TabsTrigger value="file" className="flex-1">
<FileText className="h-4 w-4 mr-1.5" /> File
</TabsTrigger>
<TabsTrigger value="text" className="flex-1">
<Sparkles className="h-4 w-4 mr-1.5" /> Paste Text
</TabsTrigger>
</TabsList>
<TabsContent value="file" className="mt-3">
<div className="space-y-1.5">
<Label htmlFor="file">
File{" "}
<span className="text-muted-foreground text-xs">
(.txt, .md, .epub)
</span>
</Label>
<div className="flex items-center gap-2">
<label
htmlFor="file"
className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2 c
>
<CloudUpload className="h-4 w-4 shrink-0" />
{selectedFile ? selectedFile.name : "Choose a file…"}
</label>
<Input
id="file"
type="file"
accept=".txt,.md,.epub"
className="hidden"
onChange={(e) =>
setSelectedFile(e.target.files?.[0] ?? null)
}
/>
{selectedFile && (
<Button
type="button"
size="icon"
variant="ghost"
className="shrink-0"
onClick={() => setSelectedFile(null)}
>
</Button>
)}
</div>
</div>
</TabsContent>
<X className="h-4 w-4" />
<TabsContent value="text" className="mt-3">
<div className="space-y-1.5">
<Label htmlFor="pastedText">Paste Manuscript</Label>
<Textarea
id="pastedText"
value={pastedText}
rows={10}
placeholder="Paste chapter content here…"
onChange={(e) => setPastedText(e.target.value)}
onPaste={(e) => {
const raw = e.clipboardData.getData("text");
e.preventDefault();
processManuscriptPaste(raw);
}}
className="font-mono text-xs resize-none"
/>
{wasAutoFilled && (
<p className="text-xs text-muted-foreground flex items-center gap-1">
<Sparkles className="h-3 w-3 text-primary" />
Metadata auto-filled from series headers.
</p>
)}
</div>
</TabsContent>
</Tabs>
{/* Submit */}
<Button
type="submit"
className="w-full rounded-xl h-12 font-black text-sm uppercase tracking-wider"
disabled={loading}
>
{loading ? (
<>
<Loader2 className="h-4 w-4 mr-2 animate-spin" />
{loadingMessage}
</>
) : (
<>
<CloudUpload className="h-4 w-4 mr-2" />
{uploadMode === "cloud" ? "Publish to Cloud" : "Save to Archive"}
</>
)}
</Button>
</form>
</CardContent>
</Card>
</div>
);
}