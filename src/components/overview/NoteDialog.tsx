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
import { Label } from "@/components/ui/label";
import { updateAircraftNote } from "@/services/aircraft";
import type { Aircraft } from "@/types";

const MAX_LENGTH = 500;

type Props = {
  aircraft: Aircraft | null;
  onClose: () => void;
};

export default function NoteDialog({ aircraft, onClose }: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      setValue(aircraft.note ?? "");
      setError(null);
      setSaving(false);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateAircraftNote(aircraft.tailNumber, value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  };

  const onClear = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAircraftNote(aircraft.tailNumber, null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear.");
      setSaving(false);
    }
  };

  const remaining = MAX_LENGTH - value.length;
  const hasExisting = (aircraft.note ?? "").length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Note — {aircraft.tailNumber}</DialogTitle>
            <DialogDescription>
              Free-text remark shown in the aircraft header. Use it for
              context that doesn't belong on a specific event or defect — e.g.
              "Grounded — waiting on spare part".
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <Label htmlFor="note">Note</Label>
            <textarea
              id="note"
              value={value}
              onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
              rows={4}
              autoFocus
              placeholder="e.g. Grounded — waiting on spare part (ETA 2 weeks)"
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
            <p className="text-[11px] text-muted-foreground text-right tabular-nums">
              {remaining} characters left
            </p>
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
              disabled={saving || !hasExisting}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
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
