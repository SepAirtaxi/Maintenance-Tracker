import { FormEvent, useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
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
import { createEvent, updateEvent } from "@/services/events";
import {
  parseDurationToMinutes,
  formatMinutesAsDuration,
  parseDecimalHoursToMinutes,
  formatMinutesAsDecimalHours,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import type { MaintenanceEvent } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tailNumber: string;
  event: MaintenanceEvent | null; // null = create
};

function timestampToInputDate(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputDateToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function EventFormDialog({
  open,
  onOpenChange,
  tailNumber,
  event,
}: Props) {
  const isEdit = event !== null;
  const [warning, setWarning] = useState("");
  const [expiryDate, setExpiryDate] = useState(""); // yyyy-mm-dd
  const [timerExpiry, setTimerExpiry] = useState(""); // HH:MM or decimal hours, depending on `timerMode`
  const [timerMode, setTimerMode] = useState<"hhmm" | "decimal">("hhmm");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWarning(event?.warning ?? "");
    setExpiryDate(timestampToInputDate(event?.expiryDate ?? null));
    setTimerExpiry(
      event?.timerExpiryTimeMinutes != null
        ? formatMinutesAsDuration(event.timerExpiryTimeMinutes)
        : "",
    );
    setTimerMode("hhmm");
    setWorkOrderNumber(event?.workOrderNumber ?? "");
    setRequisitionNumber(event?.requisitionNumber ?? "");
    setError(null);
    setSaving(false);
  }, [open, event]);

  const switchTimerMode = (next: "hhmm" | "decimal") => {
    if (next === timerMode) return;
    const trimmed = timerExpiry.trim();
    if (trimmed) {
      const minutes =
        timerMode === "hhmm"
          ? parseDurationToMinutes(trimmed)
          : parseDecimalHoursToMinutes(trimmed);
      if (minutes != null) {
        setTimerExpiry(
          next === "hhmm"
            ? formatMinutesAsDuration(minutes)
            : formatMinutesAsDecimalHours(minutes),
        );
      }
    }
    setTimerMode(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTimer = timerExpiry.trim();
    let timerMinutes: number | null = null;
    if (trimmedTimer) {
      const parsed =
        timerMode === "decimal"
          ? parseDecimalHoursToMinutes(trimmedTimer)
          : parseDurationToMinutes(trimmedTimer);
      if (parsed == null) {
        setError(
          timerMode === "decimal"
            ? "Decimal hours must look like 4969.5."
            : "TTAF expiry must look like 1234:30 (minutes 00–59).",
        );
        return;
      }
      timerMinutes = parsed;
    }

    const due = inputDateToDate(expiryDate);
    if (!due && timerMinutes == null) {
      setError("Provide a due date, a TTAF expiry, or both.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateEvent(event.id, {
          warning,
          expiryDate: due,
          timerExpiryTimeMinutes: timerMinutes,
          workOrderNumber,
          requisitionNumber: requisitionNumber || null,
        });
      } else {
        await createEvent({
          tailNumber,
          warning,
          expiryDate: due,
          timerExpiryTimeMinutes: timerMinutes,
          workOrderNumber: workOrderNumber || null,
          requisitionNumber: requisitionNumber || null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Edit event` : `Add event for ${tailNumber}`}
            </DialogTitle>
            <DialogDescription>
              At least one of due date / TTAF expiry is required.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warning">Warning / title</Label>
              <Input
                id="warning"
                value={warning}
                onChange={(e) => setWarning(e.target.value)}
                required
                placeholder="e.g. Next inspection (Date/Flighthours)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Due date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="timerExpiry">
                    TTAF expiry ({timerMode === "decimal" ? "decimal hrs" : "HH:MM"})
                  </Label>
                  <div className="inline-flex rounded-md border bg-card p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => switchTimerMode("hhmm")}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        timerMode === "hhmm"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      HH:MM
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTimerMode("decimal")}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        timerMode === "decimal"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Decimal
                    </button>
                  </div>
                </div>
                <Input
                  id="timerExpiry"
                  value={timerExpiry}
                  onChange={(e) => setTimerExpiry(e.target.value)}
                  placeholder={timerMode === "decimal" ? "e.g. 6466.6" : "e.g. 6466:36"}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wo">Work order number (optional)</Label>
                <Input
                  id="wo"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  placeholder="e.g. WO-1234"
                />
                <p className="text-xs text-muted-foreground">
                  Filling this sets the event status to{" "}
                  <span className="font-medium">WO created</span>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="req">Requisition number (optional)</Label>
                <Input
                  id="req"
                  value={requisitionNumber}
                  onChange={(e) => setRequisitionNumber(e.target.value)}
                  placeholder="e.g. REQ-9876"
                />
                <p className="text-xs text-muted-foreground">
                  Logistics-only. Doesn't affect status or bookings.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
