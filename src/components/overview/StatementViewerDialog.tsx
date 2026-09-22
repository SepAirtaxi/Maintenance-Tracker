import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { getStatementPdf } from "@/services/statements";
import type { LatestStatement } from "@/types";

export type StatementTarget = {
  tailNumber: string;
  statement: LatestStatement;
};

// The current maintenance statement for one aircraft, shown in the browser's
// own PDF viewer. Handing the file to the browser rather than rendering it
// ourselves is what gives the dialog working download and print controls for
// free — the same ones the user gets from any other PDF.
export default function StatementViewerDialog({
  target,
  onClose,
}: {
  target: StatementTarget | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tail = target?.tailNumber ?? null;

  useEffect(() => {
    if (!tail) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    setUrl(null);
    setError(null);

    void (async () => {
      try {
        const bytes = await getStatementPdf(tail);
        if (cancelled) return;
        if (!bytes) {
          setError("The statement could not be found for this aircraft.");
          return;
        }
        // Re-homed in a plain buffer before going to the Blob — the bytes
        // come back from Firestore in a view whose backing store is not
        // guaranteed to be one the Blob constructor will take.
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        objectUrl = URL.createObjectURL(
          new Blob([buffer], { type: "application/pdf" }),
        );
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setError("The statement could not be loaded.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tail]);

  const statement = target?.statement ?? null;

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="h-[88vh] w-[min(96vw,64rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-foreground/15 px-5 py-3 pr-12">
          <div className="min-w-0">
            <DialogTitle className="flex items-baseline gap-2">
              <span className="font-mono">{target?.tailNumber}</span>
              <span>
                {statement?.variant === "temp"
                  ? "Temporary Maintenance Statement"
                  : "Maintenance Statement"}
              </span>
            </DialogTitle>
            <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {statement && (
                <>
                  <span>
                    Issued{" "}
                    <span className="font-mono text-foreground/80">
                      {formatDate(statement.printedAt)}
                    </span>
                  </span>
                  <span>
                    WO{" "}
                    <span className="font-mono text-foreground/80">
                      {statement.workOrder}
                    </span>
                  </span>
                  <span>by {statement.issuedBy}</span>
                </>
              )}
            </DialogDescription>
          </div>
          {url && (
            <div className="flex items-stretch border border-foreground/25 divide-x divide-foreground/15 bg-card">
              <a
                href={url}
                download={statement?.fileName ?? "statement.pdf"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-spec text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <Download className="h-3 w-3" />
                Download
              </a>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-spec text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Open in new tab
              </a>
            </div>
          )}
        </div>

        <div className="min-h-0 bg-foreground/[0.06]">
          {error ? (
            <p className="p-6 text-xs text-sev-red-fg">{error}</p>
          ) : url ? (
            <iframe
              src={url}
              title={`Maintenance statement for ${target?.tailNumber}`}
              className="h-full w-full border-0"
            />
          ) : (
            <p className="p-6 text-xs italic text-muted-foreground">
              Loading statement…
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
