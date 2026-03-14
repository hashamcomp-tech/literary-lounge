import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * @fileOverview Unified Navigation Breadcrumbs.
 * Provides a consistent trail for users to navigate the library hierarchy.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 mb-8 overflow-x-auto whitespace-nowrap pb-2 no-scrollbar scrollbar-hide">
      <Link href="/" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 group">
        <div className="bg-muted p-1 rounded-md group-hover:bg-primary/10 transition-colors">
          <Home className="h-3 w-3" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest">Lounge</span>
      </Link>
      
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          {item.href ? (
            <Link href={item.href} className="text-muted-foreground hover:text-primary transition-colors">
              <span className="text-[10px] font-black uppercase tracking-widest max-w-[120px] truncate block">
                {item.label}
              </span>
            </Link>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/60 max-w-[150px] truncate block">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
