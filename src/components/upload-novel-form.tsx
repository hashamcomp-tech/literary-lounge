
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
  const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>(
    []
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

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

  const handleSetUploadMode = (mode: "cloud" | "local") => {
    setUploadMode(mode);
    setUserPreference("uploadMode", mode);
  };

  const handleSetSourceMode = (mode: "file" | "text") => {
    setSourceMode(mode);
    setUserPreference("sourceMode", mode);
  };

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
    const existing = allBooks.find(
      (b) => b.title.toLowerCase() === possibleTitle.toLowerCase()
    );

    if (!existing) return;

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
      description: `Detected metadata for "${existing.title}". Fields auto-filled and headers stripped.`,
    });
  };

  useEffect(() => {
    const fetchLibraryIndex = async () => {
      try {
        if (uploadMode === "cloud" && db) {
          const snap = await getDocs(collection(db, "books"));
          const books = snap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || data.metadata?.info?.bookTitle || "",
              author: data.author || data.metadata?.info?.author || "",
              totalChapters: data.metadata?.info?.totalChapters || 0,
              genre: data.genre || data.metadata?.info?.genre || [],
            };
          });
          setAllBooks(books);
        } else {
          const local = await getAllLocalBooks();
          setAllBooks(
            local.map((b) => ({
              id: b.id,
              title: b.title,
              author: b.author,
              totalChapters: b.totalChapters || 0,
              genre: Array.isArray(b.genre) ? b.genre : [b.genre],
            }))
          );
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchLibraryIndex();
  }, [uploadMode, db]);

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) return;

    setLoading(true);
    setLoadingMessage("Processing volume...");

    try {
      const searchTitle = title.trim();

The remaining section is available here:

```typescript
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
            containerDoc.querySelector("rootfile")?.getAttribute("full-path") ||
            "";
          const opfDir = opfPath.includes("/")
            ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
            : "";
          const opfXml =
            (await zip.file(opfPath)?.async("string")) || "";
          const opfDoc = parser.parseFromString(opfXml, "text/xml");

          const manifest: Record<string, string> = {};
          opfDoc.querySelectorAll("manifest item").forEach((item) => {
            const id = item.getAttribute("id");
            const href = item.getAttribute("href");
            if (id && href) manifest[id] = href;
          });

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
            const navXml =
              (await zip.file(navPath)?.async("string")) || "";
            const navDoc = parser.parseFromString(navXml, "text/html");
            navDoc.querySelectorAll("nav a, nav li a").forEach((a) => {
              const href = (a as HTMLAnchorElement)
                .getAttribute("href")
                ?.split("#")[0];
              const label = a.textContent?.trim();
              if (href && label) tocTitles[href] = label;
            });
          }
          // Same logic for ncx...

          preParsedChapters = []; // Real reconstruction logic continues...
        } else {
          manualContent = await selectedFile.text();
        }
      } else {
        manualContent = pastedText;
      }

      if (uploadMode === "cloud") {
        if (!canUploadCloud)
          throw new Error("Cloud publishing restricted.");
        // Entire upload logic for cloud...
      } else {
        // Entire archiving logic locally...
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

  useEffect(() => {
    if (
      isOfflineMode ||
      !db ||
      !user ||
      user.isAnonymous
    ) {
      setCanUploadCloud(false);
      if (preferencesLoaded && uploadMode === "cloud")
        setUploadMode("local");
      return;
    }
    const checkPermissions = async () => {
      const pRef = doc(db, "users", user.uid);
      const snap = await getDoc(pRef);
      const data = snap.data();
      const permitted =
        user.email === "hashamcomp@gmail.com" || data?.role === "admin";
      setCanUploadCloud(permitted);
      if (uploadMode === "cloud" && !permitted && preferencesLoaded) {
        setUploadMode("local");
      }
    };
    checkPermissions();
  }, [user, db, isOfflineMode, uploadMode, preferencesLoaded]);

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20">
      <Card className="border-none shadow-2xl bg-card/80 backdrop-blur rounded-[2.5rem] overflow-hidden">
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
        <CardContent className="space-y-6">{/* Remaining JSX... */}</CardContent>
      </Card>
    </div>
  );
}