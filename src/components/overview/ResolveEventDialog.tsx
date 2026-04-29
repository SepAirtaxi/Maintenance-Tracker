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
import { resolveEvent } from "@/services/events";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { useAuth } from "@/context/AuthContext";
import type { MaintenanceEvent } from "@/types";

type Props = {
  event: MaintenanceEvent | null;
  onClose: () => void;
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

export default function ResolveEventDialog({ event, onClose }: Props) {
  const { user } = useAuth();
  const [resolvedDate, setResolvedDate] = useState(tsToInput(new Date()));
  const [workOrder, setWorkOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setResolvedDate(tsToInput(new Date()));
      setWorkOrder(event.workOrderNumber ?? "");
      setError(null);
      setSaving(false);
    }
  }, [event]);

  if (!event) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const date = inputToDate(resolvedDate);
    if (!date) {
      setError("Resolution date is required.");
      return;
    }
    if (!workOrder.trim()) {
      setError("Work order number is required.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setSaving(true);
    try {
      await resolveEvent(
        event.id,
        { resolvedDate: date, resolutionWorkOrder: workOrder.trim() },
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="closeDate">Completion date</Label>
                <Input
                  id="closeDate"
                  type="date"
                  value={resolvedDate}
                  onChange={(e) => setResolvedDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closeWO">Work order #</Label>
                <Input
                  id="closeWO"
                  value={workOrder}
                  onChange={(e) => setWorkOrder(e.target.value)}
                  required
                  placeholder="e.g. 6600"
                  className="font-mono"
                  autoFocus={!event.workOrderNumber}
                />
              </div>
            </div>

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
