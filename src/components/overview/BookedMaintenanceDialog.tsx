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
import { updateBookedMaintenance } from "@/services/aircraft";
import type { Aircraft } from "@/types";

type Props = {
  aircraft: Aircraft | null;
  onClose: () => void;
};

function tsToInputDate(ts: Timestamp | undefined | null): string {
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

export default function BookedMaintenanceDialog({ aircraft, onClose }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      const booking = aircraft.nextBookedMaintenance;
      setFrom(tsToInputDate(booking?.from));
      setTo(tsToInputDate(booking?.to));
      setOpenEnded(!!booking && booking.to == null);
      setError(null);
      setSaving(false);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const fromDate = inputDateToDate(from);
    if (!fromDate) {
      setError("From date is required.");
      return;
    }
    let toDate: Date | null = null;
    if (!openEnded) {
      toDate = inputDateToDate(to);
      if (!toDate) {
        setError("To date is required (or check 'Unknown release date').");
        return;
      }
    }
    setSaving(true);
    try {
      await updateBookedMaintenance(aircraft.tailNumber, {
        from: fromDate,
        to: toDate,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateBookedMaintenance(aircraft.tailNumber, null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear.");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              Next booked maintenance — {aircraft.tailNumber}
            </DialogTitle>
            <DialogDescription>
              Date range for the next scheduled hangar visit. Optional.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bookedFrom">From</Label>
                <Input
                  id="bookedFrom"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="bookedTo"
                  className={openEnded ? "text-muted-foreground" : undefined}
                >
                  To
                </Label>
                <Input
                  id="bookedTo"
                  type="date"
                  value={openEnded ? "" : to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={openEnded}
                  placeholder={openEnded ? "open-ended" : undefined}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={openEnded}
                onChange={(e) => setOpenEnded(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>
                Unknown release date{" "}
                <span className="text-muted-foreground">
                  (e.g. waiting on parts)
                </span>
              </span>
            </label>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="flex sm:justify-between sm:items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={onClear}
              disabled={saving || !aircraft.nextBookedMaintenance}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
