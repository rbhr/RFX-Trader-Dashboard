import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export type PageSize = number | "all";
export const PAGE_SIZES: PageSize[] = [10, 20, 30, "all"];

/** Slice `items` for the current page; returns the page slice + paging metadata. */
export function paginate<T>(items: T[], pageSize: PageSize, page: number) {
  const total = items.length;
  const isAll = pageSize === "all";
  const size = isAll ? Math.max(total, 1) : (pageSize as number);
  const pageCount = isAll ? 1 : Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pageCount - 1);
  const startIdx = cur * size;
  const slice = isAll ? items : items.slice(startIdx, startIdx + size);
  return {
    slice,
    total,
    pageCount,
    cur,
    isAll,
    start: total === 0 ? 0 : startIdx + 1,
    end: Math.min(startIdx + size, total),
  };
}

export function PaginationBar({
  total,
  pageSize,
  setPageSize,
  page,
  setPage,
}: {
  total: number;
  pageSize: PageSize;
  setPageSize: (s: PageSize) => void;
  page: number;
  setPage: (p: number) => void;
}) {
  const isAll = pageSize === "all";
  const size = isAll ? Math.max(total, 1) : (pageSize as number);
  const pageCount = isAll ? 1 : Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pageCount - 1);
  const start = total === 0 ? 0 : cur * size + 1;
  const end = Math.min((cur + 1) * size, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <span className="text-xs text-muted-foreground">
        {total === 0 ? "No entries" : `Showing ${start}–${end} of ${total}`}
      </span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {PAGE_SIZES.map((s) => (
            <Button
              key={String(s)}
              size="sm"
              variant={pageSize === s ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                setPageSize(s);
                setPage(0);
              }}
            >
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="First page" disabled={isAll || cur === 0} onClick={() => setPage(0)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Previous page" disabled={isAll || cur === 0} onClick={() => setPage(cur - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-1 whitespace-nowrap">
            Page {cur + 1} / {pageCount}
          </span>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Next page" disabled={isAll || cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Last page" disabled={isAll || cur >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
