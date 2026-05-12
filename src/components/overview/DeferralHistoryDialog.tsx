import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, RotateCcw, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  DEFERRAL_REVIEW_DAYS,
  daysSinceDeferred,
  getDeferralStatus,
} from "@/lib/eventStatus";
import {
  subscribeAuditLog,
  type AuditLogEntry,
} from "@/services/audit";
import type { Defect } from "@/types";

type Props = {
  defect: Defect | null;
  onClose: () => void;
};

type DeferralKind = "deferred" | "re-deferred" | "lifted";

type ParsedEntry = {
  entry: AuditLogEntry;
  kind: DeferralKind;
  reason: string | null;
};

// Audit summaries are written by `deferDefect` / `undeferDefect` with the
// formats below. We rely on the leading prefix and the " — " separator that
// fences the reason text from the defect title.
function parseDeferralEntry(summary: string): {
  kind: DeferralKind;
  reason: string | null;
} | null {
  if (summary.startsWith("Defect deferred (30-day review):")) {
    const idx = summary.indexOf(" — ");
    return {
      kind: "deferred",
      reason: idx >= 0 ? summary.slice(idx + 3).trim() : null,
    };
  }
  if (summary.startsWith("Defect re-deferred:")) {
    const idx = summary.indexOf(" — ");
    return {
      kind: "re-deferred",
      reason: idx >= 0 ? summary.slice(idx + 3).trim() : null,
    };
  }
  if (summary.startsWith("Defect deferral lifted:")) {
    return { kind: "lifted", reason: null };
  }
  return null;
}

const KIND_META: Record<
  DeferralKind,
  {
    label: string;
    badgeClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  deferred: {
    label: "Deferred",
    badgeClass: "border-amber-400 bg-amber-100 text-amber-900",
    Icon: Clock,
  },
  "re-deferred": {
    label: "Re-deferred",
    badgeClass: "border-amber-500 bg-amber-200 text-amber-950",
    Icon: RotateCcw,
  },
  lifted: {
    label: "Lifted",
    badgeClass: "border-emerald-400 bg-emerald-100 text-emerald-900",
    Icon: Undo2,
  },
};

export default function DeferralHistoryDialog({ defect, onClose }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    if (!defect) {
      setEntries(null);
      return;
    }
    setEntries(null);
    const unsub = subscribeAuditLog(defect.tailNumber, setEntries, {
      limit: 500,
    });
    return unsub;
  }, [defect?.id, defect?.tailNumber]);

  const parsed: ParsedEntry[] = useMemo(() => {
    if (!entries || !defect) return [];
    const out: ParsedEntry[] = [];
    for (const e of entries) {
      if (e.entity !== "defect") continue;
      if (e.entityId !== defect.id) continue;
      const p = parseDeferralEntry(e.summary);
      if (!p) continue;
      out.push({ entry: e, ...p });
    }
    return out;
  }, [entries, defect]);

  if (!defect) return null;

  const status = getDeferralStatus(defect);
  const elapsed = daysSinceDeferred(defect);
  const wasDeferred = defect.deferredAt != null;

  // Fallback: if the defect is currently deferred but no matching audit entry
  // exists yet (server timestamp may still be in flight, or the deferral
  // predates the audit log), synthesize one from the defect doc so the user
  // sees the current state.
  const hasCurrentDeferralEntry =
    !wasDeferred ||
    parsed.some(
      (p) =>
        (p.kind === "deferred" || p.kind === "re-deferred") &&
        p.entry.at != null &&
        defect.deferredAt != null &&
        Math.abs(p.entry.at.toMillis() - defect.deferredAt.toMillis()) <
          60_000,
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Deferral history — {defect.tailNumber}
          </DialogTitle>
          <DialogDescription>"{defect.title}"</DialogDescription>
        </DialogHeader>

        {wasDeferred && defect.deferredAt && (
          <div
            className={cn(
              "mt-2 rounded-md border px-3 py-2 text-xs",
              status === "overdue"
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-amber-300 bg-amber-50 text-amber-900",
            )}
          >
            <p className="font-medium flex items-center gap-1.5">
              {status === "overdue" ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {status === "overdue"
                ? `Review overdue — ${elapsed}d since deferral (limit ${DEFERRAL_REVIEW_DAYS}d).`
                : `Currently deferred — ${elapsed}d of ${DEFERRAL_REVIEW_DAYS}d elapsed.`}
            </p>
            <p className="mt-0.5 opacity-90">
              Deferred {formatDate(defect.deferredAt)}
              {defect.deferralReason ? ` · "${defect.deferralReason}"` : ""}
            </p>
          </div>
        )}

        <div className="py-2">
          {entries === null && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {entries !== null && parsed.length === 0 && !wasDeferred && (
            <p className="text-sm text-muted-foreground italic">
              No deferral history for this defect.
            </p>
          )}

          {entries !== null &&
            parsed.length === 0 &&
            wasDeferred &&
            defect.deferredAt && (
              <div className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground italic">
                No audit entries recorded for this deferral. Current state is
                shown above.
              </div>
            )}

          {parsed.length > 0 && (
            <ol className="space-y-1.5">
              {!hasCurrentDeferralEntry && defect.deferredAt && (
                <li className="rounded-md border border-dashed bg-card px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        KIND_META.deferred.badgeClass,
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      Current
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatDateTime(defect.deferredAt)}
                    </span>
                  </div>
                  {defect.deferralReason && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                      {defect.deferralReason}
                    </p>
                  )}
                </li>
              )}
              {parsed.map((p) => {
                const { label, badgeClass, Icon } = KIND_META[p.kind];
                return (
                  <li
                    key={p.entry.id}
                    className="rounded-md border bg-card px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          badgeClass,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDateTime(p.entry.at)}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {p.entry.byInitials}
                      </span>
                    </div>
                    {p.reason ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                        {p.reason}
                      </p>
                    ) : p.kind === "lifted" ? (
                      <p className="mt-1 italic text-muted-foreground">
                        Deferral lifted.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
