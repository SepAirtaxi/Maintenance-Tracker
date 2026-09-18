// Upload bar for the ERP compliance report that feeds the Next Due pickers.

import { useRef } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComplianceReport } from "@/compliance/types";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB");
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
  const mismatch =
    report && expectedTail && report.header.tailNumber !== expectedTail;

  return (
    <div className="space-y-2">
      <div
        className={
          report
            ? "flex flex-wrap items-center gap-3 border border-foreground/15 bg-background p-3"
            : // No report yet — the bar wears the solid accent amber (the same
              // fill the "use current" chips take on hover) so the one action
              // the page is waiting on reads as the next step.
              "flex flex-wrap items-center gap-3 border border-foreground/20 bg-accent p-3"
        }
      >
        <FileUp
          className={
            report
              ? "h-4 w-4 shrink-0 text-muted-foreground"
              : "h-4 w-4 shrink-0 text-accent-foreground"
          }
        />
        <div className="min-w-0 flex-1">
          {report ? (
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
                : "Upload the aircraft status report to list what's next due."}
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
            if (file) onFile(file);
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

      {error && (
        <p className="border border-sev-red-edge bg-sev-red-bg px-3 py-2 text-xs text-sev-red-fg">
          {error}
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
