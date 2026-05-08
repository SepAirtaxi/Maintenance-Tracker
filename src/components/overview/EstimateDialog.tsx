import { FormEvent, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  setEventEstimate,
  clearEventEstimate,
} from "@/services/events";
import {
  setDefectEstimate,
  clearDefectEstimate,
} from "@/services/defects";
import type { Defect, MaintenanceEvent } from "@/types";

export type EstimateTarget =
  | { kind: "event"; event: MaintenanceEvent }
  | { kind: "defect"; defect: Defect };

type Props = {
  target: EstimateTarget | null;
  onClose: () => void;
};

function getDisplay(target: EstimateTarget): {
  tail: string;
  title: string;
  estimated: boolean;
  manHours: number | null;
} {
  if (target.kind === "event") {
    return {
      tail: target.event.tailNumber,
      title: target.event.warning,
      estimated: target.event.estimated,
      manHours: target.event.estimatedManHours,
    };
  }
  return {
    tail: target.defect.tailNumber,
    title: target.defect.title,
    estimated: target.defect.estimated,
    manHours: target.defect.estimatedManHours,
  };
}

export default function EstimateDialog({ target, onClose }: Props) {
  const [estimated, setEstimated] = useState<boolean>(false);
  const [hours, setHours] = useState<string>("");
  const [saving, setSaving] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      const d = getDisplay(target);
      setEstimated(d.estimated);
      setHours(d.manHours != null ? String(d.manHours) : "");
      setError(null);
      setSaving(null);
    }
  }, [target]);

  if (!target) return null;
  const { tail, title, estimated: prevEstimated, manHours: prevHours } =
    getDisplay(target);
  const hadAny = prevEstimated || prevHours != null;
  const id = target.kind === "event" ? target.event.id : target.defect.id;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedHours: number | null = null;
    if (estimated && hours.trim() !== "") {
      const n = Number(hours);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Man hours must be a positive number.");
        return;
      }
      parsedHours = n;
    }

    setSaving("save");
    try {
      if (target.kind === "event") {
        await setEventEstimate(id, {
          estimated,
          estimatedManHours: parsedHours,
        });
      } else {
        await setDefectEstimate(id, {
          estimated,
          estimatedManHours: parsedHours,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate.");
    } finally {
      setSaving(null);
    }
  };

  const onClear = async () => {
    setError(null);
    setSaving("clear");
    try {
      if (target.kind === "event") {
        await clearEventEstimate(id);
      } else {
        await clearDefectEstimate(id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear estimate.");
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;
  const submitLabel = hadAny ? "Update estimate" : "Save estimate";

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {hadAny ? "Manage estimate" : "Set estimate"} — {tail}
            </DialogTitle>
            <DialogDescription>"{title}"</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEstimated(true)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  estimated
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary/60",
                )}
              >
                Estimated
              </button>
              <button
                type="button"
                onClick={() => setEstimated(false)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  !estimated
                    ? "border-foreground/40 bg-secondary text-foreground ring-1 ring-foreground/20"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary/60",
                )}
              >
                Not estimated
              </button>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="estManHours"
                className={cn(!estimated && "text-muted-foreground")}
              >
                Man hours <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="estManHours"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 4"
                className="font-mono"
                disabled={!estimated}
              />
              <p className="text-xs text-muted-foreground">
                Planner's man-hour estimate for this work item — not flight
                hours. Leave blank if not yet estimated.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="flex sm:justify-between sm:items-center">
            {hadAny ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onClear}
                disabled={busy}
                className="text-rose-700 hover:bg-rose-100 hover:text-rose-800"
              >
                {saving === "clear" ? "Clearing…" : "Clear estimate"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {saving === "save" ? "Saving…" : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
