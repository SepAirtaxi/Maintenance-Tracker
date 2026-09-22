// Upload bar for the ERP compliance report that feeds the Next Due pickers.
// Takes the file either from the file picker or from a drag straight out of
// the mail client — the report arrives by email, so saving it to disk first
// is a step worth skipping.

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComplianceReport } from "@/compliance/types";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB");
}

// Outlook hands over an attachment as a *virtual* file: nothing exists on disk
// until the receiver asks for it. getAsFile() returns null or an empty stub for
// those; only getAsFileSystemHandle() makes the browser fetch the bytes. It is
// a Chromium extension to the drag API, so it is reached through a cast.
type VirtualFileItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

// dataTransfer is emptied the moment the drop handler returns, so every item is
// read synchronously here and only the resulting promises are awaited.
function readDrop(dt: DataTransfer): Promise<File | null> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === "file");
  const handles = items.map((i) => {
    const v = i as VirtualFileItem;
    return typeof v.getAsFileSystemHandle === "function"
      ? v.getAsFileSystemHandle().catch(() => null)
      : null;
  });
  const plain = items.map((i) => i.getAsFile());
  const listed = Array.from(dt.files ?? []);

  return (async () => {
    // Virtual files first — a plain read of the same item would look like a
    // real but empty file and fail further down as a corrupt PDF.
    for (const pending of handles) {
      const handle = await pending;
      if (!handle || handle.kind !== "file") continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.size > 0) return file;
      } catch {
        // Permission or transfer failure — fall through to the plain reads.
      }
    }
    for (const file of [...plain, ...listed]) {
      if (file && file.size > 0) return file;
    }
    return null;
  })();
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function ComplianceUpload({
  report,
  fileName,
  parsing,
  error,
  expectedTail,
  onFile,
  onClear,
  onUseReportTail,
}: {
  report: ComplianceReport | null;
  fileName: string | null;
  parsing: boolean;
  error: string | null;
  // The registration typed on the page, so a report for the wrong aircraft is
  // caught before any of its deadlines reach the statement.
  expectedTail: string;
  onFile: (file: File) => void;
  onClear: () => void;
  onUseReportTail: (tail: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child the pointer crosses, so the depth
  // is counted rather than toggled — otherwise the highlight flickers.
  const dragDepth = useRef(0);
  const [dropError, setDropError] = useState<string | null>(null);
  const mismatch =
    report && expectedTail && report.header.tailNumber !== expectedTail;

  const endDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
  };

  return (
    <div className="space-y-2">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) endDrag();
        }}
        onDrop={(e) => {
          e.preventDefault();
          endDrag();
          if (parsing) return;
          void readDrop(e.dataTransfer).then((file) => {
            if (!file) {
              setDropError(
                "That drag didn't carry a readable file — drag it from a folder, or use Upload report.",
              );
              return;
            }
            if (!isPdf(file)) {
              setDropError(`${file.name} isn't a PDF.`);
              return;
            }
            setDropError(null);
            onFile(file);
          });
        }}
        className={
          dragging
            ? // Drag in progress — the whole bar is the target, marked by a
              // heavier hairline over the accent fill.
              "flex flex-wrap items-center gap-3 border border-foreground/60 bg-accent p-3"
            : report
              ? "flex flex-wrap items-center gap-3 border border-foreground/15 bg-background p-3"
              : // No report yet — the bar wears the solid accent amber (the same
                // fill the "use current" chips take on hover) so the one action
                // the page is waiting on reads as the next step.
                "flex flex-wrap items-center gap-3 border border-foreground/20 bg-accent p-3"
        }
      >
        <FileUp
          className={
            report && !dragging
              ? "h-4 w-4 shrink-0 text-muted-foreground"
              : "h-4 w-4 shrink-0 text-accent-foreground"
          }
        />
        <div className="min-w-0 flex-1">
          {dragging ? (
            <span className="text-xs font-medium text-accent-foreground">
              {report
                ? "Drop to replace the report."
                : "Drop the aircraft status report here."}
            </span>
          ) : report ? (
            <>
              <span className="block truncate font-mono text-xs text-foreground">
                {report.header.tailNumber} · {report.records.length} events
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {fileName}
                {report.header.printedOn &&
                  ` · printed ${fmtDate(report.header.printedOn)}`}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-accent-foreground">
              {parsing
                ? "Reading report…"
                : "Drop the aircraft status report here, or upload it."}
            </span>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setDropError(null);
              onFile(file);
            }
            // Cleared so re-picking the same file fires onChange again.
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={parsing}
          onClick={() => inputRef.current?.click()}
        >
          {report ? "Replace" : "Upload report"}
        </Button>
        {report && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove report"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {(error || dropError) && (
        <p className="border border-sev-red-edge bg-sev-red-bg px-3 py-2 text-xs text-sev-red-fg">
          {error ?? dropError}
        </p>
      )}

      {mismatch && (
        <p className="flex flex-wrap items-center gap-2 border border-sev-yellow-edge bg-sev-yellow-bg px-3 py-2 text-xs text-sev-yellow-fg">
          This report is for{" "}
          <span className="font-mono font-semibold">
            {report.header.tailNumber}
          </span>
          , but the statement is for{" "}
          <span className="font-mono font-semibold">{expectedTail}</span>.
          <button
            type="button"
            onClick={() => onUseReportTail(report.header.tailNumber)}
            className="underline underline-offset-2 hover:no-underline"
          >
            Switch to {report.header.tailNumber}
          </button>
        </p>
      )}

      {report?.warnings.map((w) => (
        <p key={w} className="px-1 text-[10px] text-muted-foreground">
          {w}
        </p>
      ))}
    </div>
  );
}
