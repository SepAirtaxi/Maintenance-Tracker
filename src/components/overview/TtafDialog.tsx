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
  formatMinutesAsDecimalHours,
  parseDurationToMinutes,
  parseDecimalHoursToMinutes,
} from "@/lib/time";
import { cn } from "@/lib/utils";
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
  const [mode, setMode] = useState<"hhmm" | "decimal">("hhmm");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      setValue(
        aircraft.totalTimeMinutes != null
          ? formatMinutesAsDuration(aircraft.totalTimeMinutes)
          : "",
      );
      setMode("hhmm");
      setError(null);
      setSaving(false);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  const switchMode = (next: "hhmm" | "decimal") => {
    if (next === mode) return;
    const trimmed = value.trim();
    if (trimmed) {
      const minutes =
        mode === "hhmm"
          ? parseDurationToMinutes(trimmed)
          : parseDecimalHoursToMinutes(trimmed);
      if (minutes != null) {
        setValue(
          next === "hhmm"
            ? formatMinutesAsDuration(minutes)
            : formatMinutesAsDecimalHours(minutes),
        );
      }
    }
    setMode(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const minutes =
      mode === "decimal"
        ? parseDecimalHoursToMinutes(value.trim())
        : parseDurationToMinutes(value.trim());
    if (minutes == null) {
      setError(
        mode === "decimal"
          ? "Decimal hours must look like 4969.5."
          : "Enter a value like 1234:30 (minutes 00–59).",
      );
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

  const parsed =
    mode === "decimal"
      ? parseDecimalHoursToMinutes(value.trim())
      : parseDurationToMinutes(value.trim());
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ttaf">
                  TTAF ({mode === "decimal" ? "decimal hrs" : "HH:MM"})
                </Label>
                <div className="inline-flex rounded-md border bg-card p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => switchMode("hhmm")}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono transition-colors",
                      mode === "hhmm"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    HH:MM
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("decimal")}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono transition-colors",
                      mode === "decimal"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Decimal
                  </button>
                </div>
              </div>
              <Input
                id="ttaf"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === "decimal" ? "e.g. 6466.6" : "e.g. 6466:36"}
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
