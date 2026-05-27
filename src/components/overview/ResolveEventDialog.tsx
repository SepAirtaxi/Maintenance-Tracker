import { FormEvent, useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveEvent } from "@/services/events";
import { formatDate } from "@/lib/format";
import {
  detectTtafFormat,
  formatMinutesAsDuration,
  parseTtafInput,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import type { MaintenanceEvent } from "@/types";

type Props = {
  event: MaintenanceEvent | null;
  onClose: () => void;
  // The aircraft's currently stored TTAF — fills the "TTAF at close" field
  // via the import button. Null when the aircraft has no recorded TTAF yet.
  currentTtafMinutes: number | null;
};

function tsToInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function ResolveEventDialog({
  event,
  onClose,
  currentTtafMinutes,
}: Props) {
  const { user } = useAuth();
  const [resolvedDate, setResolvedDate] = useState(tsToInput(new Date()));
  const [workOrder, setWorkOrder] = useState("");
  const [resolvedTtaf, setResolvedTtaf] = useState("");
  const [administrative, setAdministrative] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setResolvedDate(tsToInput(new Date()));
      setWorkOrder(event.workOrderNumber ?? "");
      setResolvedTtaf("");
      setAdministrative(false);
      setError(null);
      setSaving(false);
    }
  }, [event]);

  if (!event) return null;

  const ttafDetectedMode = detectTtafFormat(resolvedTtaf);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const date = inputToDate(resolvedDate);
    if (!date) {
      setError("Resolution date is required.");
      return;
    }
    if (!administrative && !workOrder.trim()) {
      setError("Work order number is required.");
      return;
    }
    let resolutionTtafMinutes: number | null = null;
    const ttafTrimmed = resolvedTtaf.trim();
    if (!administrative) {
      if (!ttafTrimmed) {
        setError("TTAF at close is required.");
        return;
      }
      const parsed = parseTtafInput(ttafTrimmed);
      if (parsed == null) {
        setError(
          "TTAF at close must look like 1234:30 (HH:MM) or 1234.5 (decimal hours).",
        );
        return;
      }
      resolutionTtafMinutes = parsed;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setSaving(true);
    try {
      await resolveEvent(
        event.id,
        {
          resolvedDate: date,
          resolutionWorkOrder: administrative ? null : workOrder.trim(),
          resolutionTtafMinutes,
        },
        user.uid,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close event.");
    } finally {
      setSaving(false);
    }
  };

  const dueParts: string[] = [];
  if (event.expiryDate) dueParts.push(`due ${formatDate(event.expiryDate)}`);
  if (event.timerExpiryTimeMinutes != null) {
    dueParts.push(
      `at TTAF ${formatMinutesAsDuration(event.timerExpiryTimeMinutes)}`,
    );
  }
  const dueSuffix = dueParts.length > 0 ? ` — ${dueParts.join(", ")}` : "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Close event — {event.tailNumber}</DialogTitle>
            <DialogDescription>
              "{event.warning}"{dueSuffix}. Closing the event ties it to a work
              order and removes it from the active overview; it is kept as a
              legacy record.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="closeDate">Completion date</Label>
              <Input
                id="closeDate"
                type="date"
                value={resolvedDate}
                onChange={(e) => setResolvedDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closeWO">Work order #</Label>
              <Input
                id="closeWO"
                value={administrative ? "" : workOrder}
                onChange={(e) => setWorkOrder(e.target.value)}
                required={!administrative}
                disabled={administrative}
                placeholder={administrative ? "—" : "e.g. 6600"}
                className="font-mono"
                autoFocus={!event.workOrderNumber}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closeTtaf">TTAF at close</Label>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <Input
                    id="closeTtaf"
                    value={administrative ? "" : resolvedTtaf}
                    onChange={(e) => setResolvedTtaf(e.target.value)}
                    required={!administrative}
                    disabled={administrative}
                    placeholder={administrative ? "—" : "e.g. 6480:12"}
                    className="font-mono pr-[110px]"
                  />
                  {!administrative && resolvedTtaf.trim() && (
                    <span
                      className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5 text-[10px] font-mono"
                      aria-label="Detected input format"
                    >
                      <span
                        className={cn(
                          "px-1 transition-colors",
                          ttafDetectedMode === "hhmm"
                            ? "text-foreground/80"
                            : "text-foreground/25",
                        )}
                      >
                        HH:MM
                      </span>
                      <span className="text-foreground/15">|</span>
                      <span
                        className={cn(
                          "px-1 transition-colors",
                          ttafDetectedMode === "decimal"
                            ? "text-foreground/80"
                            : "text-foreground/25",
                        )}
                      >
                        Decimal
                      </span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={administrative || currentTtafMinutes == null}
                  onClick={() => {
                    if (currentTtafMinutes != null) {
                      setResolvedTtaf(
                        formatMinutesAsDuration(currentTtafMinutes),
                      );
                    }
                  }}
                  title={
                    administrative
                      ? "Disabled — TTAF is skipped on administrative close"
                      : currentTtafMinutes == null
                      ? "No current TTAF on file for this aircraft"
                      : `Use aircraft's current TTAF (${formatMinutesAsDuration(currentTtafMinutes)})`
                  }
                  aria-label="Use aircraft's current TTAF"
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center justify-center border border-foreground/30 bg-card px-3 transition-colors",
                    administrative || currentTtafMinutes == null
                      ? "text-muted-foreground/40 cursor-not-allowed bg-muted"
                      : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <Wand2 className="h-4 w-4" />
                </button>
              </div>
              {!administrative && (
                <p className="text-[11px] text-muted-foreground">
                  {currentTtafMinutes != null ? (
                    <>
                      Click the wand to fill with the aircraft's current TTAF:{" "}
                      <span className="font-mono text-foreground/80">
                        {formatMinutesAsDuration(currentTtafMinutes)}
                      </span>
                      .
                    </>
                  ) : (
                    "No current TTAF on file for this aircraft yet."
                  )}
                </p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 border-t border-foreground/10 pt-3 text-sm">
              <input
                type="checkbox"
                checked={administrative}
                onChange={(e) => setAdministrative(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              />
              <span className="select-none">
                <span className="font-medium">Administrative close</span>
                <span className="block text-xs text-muted-foreground">
                  For events not tracked in the work-order system (AMP / ARC
                  renewals etc.). Skips both WO and TTAF.
                </span>
              </span>
            </label>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Closing…" : "Close event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
