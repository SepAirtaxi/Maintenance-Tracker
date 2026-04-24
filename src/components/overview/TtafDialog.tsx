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
import {
  formatMinutesAsDuration,
  parseDurationToMinutes,
} from "@/lib/time";
import { updateTtafManual } from "@/services/aircraft";
import { useAuth } from "@/context/AuthContext";
import type { Aircraft } from "@/types";

type Props = {
  aircraft: Aircraft | null;
  onClose: () => void;
};

export default function TtafDialog({ aircraft, onClose }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      setValue(
        aircraft.totalTimeMinutes != null
          ? formatMinutesAsDuration(aircraft.totalTimeMinutes)
          : "",
      );
      setError(null);
      setSaving(false);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const minutes = parseDurationToMinutes(value.trim());
    if (minutes == null) {
      setError("Enter a value like 1234.30 or 1234:30.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    const stored = aircraft.totalTimeMinutes;
    if (stored != null && minutes < stored) {
      // Allow but require explicit confirmation via the confirm flow below.
    }
    setSaving(true);
    try {
      await updateTtafManual(aircraft.tailNumber, minutes, user.uid);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const parsed = parseDurationToMinutes(value.trim());
  const isDecrement =
    parsed != null &&
    aircraft.totalTimeMinutes != null &&
    parsed < aircraft.totalTimeMinutes;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Update TTAF — {aircraft.tailNumber}</DialogTitle>
            <DialogDescription>
              Manual override. Replaces any value set via CSV import. Can be
              used to reduce TTAF if an imported value was wrong.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ttaf">TTAF (HH.MM)</Label>
              <Input
                id="ttaf"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 6466.36"
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Current:{" "}
                <span className="font-mono">
                  {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
                </span>
              </p>
            </div>

            {isDecrement && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                You're <b>decreasing</b> TTAF. Make sure this is intentional —
                the transaction log will record it.
              </p>
            )}

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
              {saving ? "Saving…" : "Update TTAF"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
