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
import { resolveDefect } from "@/services/defects";
import { formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { useAuth } from "@/context/AuthContext";
import type { Defect } from "@/types";

type Props = {
  defect: Defect | null;
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

export default function ResolveDefectDialog({ defect, onClose }: Props) {
  const { user } = useAuth();
  const [resolvedDate, setResolvedDate] = useState(tsToInput(new Date()));
  const [workOrder, setWorkOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defect) {
      setResolvedDate(tsToInput(new Date()));
      setWorkOrder("");
      setError(null);
      setSaving(false);
    }
  }, [defect]);

  if (!defect) return null;

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
      await resolveDefect(
        defect.id,
        { resolvedDate: date, resolutionWorkOrder: workOrder.trim() },
        user.uid,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Resolve defect — {defect.tailNumber}</DialogTitle>
            <DialogDescription>
              "{defect.title}" — reported {formatDate(defect.reportedDate)} at
              TTAF {formatMinutesAsDuration(defect.reportedTtafMinutes)}.
              Resolution is logged; the defect is removed from the active
              overview but kept as a legacy record.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="resolveDate">Resolution date</Label>
                <Input
                  id="resolveDate"
                  type="date"
                  value={resolvedDate}
                  onChange={(e) => setResolvedDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resolveWO">Work order #</Label>
                <Input
                  id="resolveWO"
                  value={workOrder}
                  onChange={(e) => setWorkOrder(e.target.value)}
                  required
                  placeholder="e.g. WO-12345"
                  className="font-mono"
                  autoFocus
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
              {saving ? "Resolving…" : "Resolve defect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
