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
  detectTtafFormat,
  parseTtafInput,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { updateLandingsManual, updateTtafManual } from "@/services/aircraft";
import { useAuth } from "@/context/AuthContext";
import type { Aircraft } from "@/types";

type Props = {
  aircraft: Aircraft | null;
  onClose: () => void;
};

export default function TtafDialog({ aircraft, onClose }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState("");
  const [landings, setLandings] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      setValue(
        aircraft.totalTimeMinutes != null
          ? formatMinutesAsDuration(aircraft.totalTimeMinutes)
          : "",
      );
      setLandings(
        aircraft.totalLandings != null ? String(aircraft.totalLandings) : "",
      );
      setError(null);
      setSaving(false);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  // Landings are only entered by hand on aircraft the Flightlogger sync
  // skips — anywhere else the next sync would overwrite them.
  const manualLandings = aircraft.syncTtafFromFlightlogger === false;

  const detectedMode = detectTtafFormat(value);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const minutes = parseTtafInput(value.trim());
    if (minutes == null) {
      setError("Enter a value like 1234:30 (HH:MM) or 1234.5 (decimal hours).");
      return;
    }
    const landingsTrim = landings.trim();
    const landingsNum = landingsTrim === "" ? null : Number(landingsTrim);
    if (
      manualLandings &&
      landingsNum != null &&
      (!Number.isInteger(landingsNum) || landingsNum < 0)
    ) {
      setError("Landings must be a whole number, 0 or more.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setSaving(true);
    try {
      const landingsChanged =
        manualLandings &&
        landingsNum != null &&
        landingsNum !== aircraft.totalLandings;
      // A landings-only edit leaves TTAF (and its "Updated" date and
      // last-flight delta) alone.
      if (minutes !== aircraft.totalTimeMinutes || !landingsChanged) {
        await updateTtafManual(aircraft.tailNumber, minutes, user.uid);
      }
      if (landingsChanged) {
        await updateLandingsManual(aircraft.tailNumber, landingsNum);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const parsed = parseTtafInput(value.trim());
  const landingsParsed = landings.trim() === "" ? null : Number(landings.trim());
  const isLandingsDecrement =
    manualLandings &&
    landingsParsed != null &&
    aircraft.totalLandings != null &&
    landingsParsed < aircraft.totalLandings;
  const isDecrement =
    parsed != null &&
    aircraft.totalTimeMinutes != null &&
    parsed < aircraft.totalTimeMinutes;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              Update {manualLandings ? "TTAF + landings" : "TTAF"} —{" "}
              {aircraft.tailNumber}
            </DialogTitle>
            <DialogDescription>
              {manualLandings
                ? "This aircraft is excluded from the Flightlogger sync, so TTAF and landings are kept here by hand."
                : "Manual override. Replaces the value synced from Flightlogger. Can be used to reduce TTAF if a synced value was wrong."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ttaf">TTAF</Label>
                <div
                  className="inline-flex rounded-md border bg-card p-0.5 text-[10px]"
                  aria-label="Detected input format"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono transition-colors",
                      detectedMode === "hhmm"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    HH:MM
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono transition-colors",
                      detectedMode === "decimal"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    Decimal
                  </span>
                </div>
              </div>
              <Input
                id="ttaf"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 6466:36 or 6466.6"
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

            {manualLandings && (
              <div className="space-y-2">
                <Label htmlFor="landings">Landings</Label>
                <Input
                  id="landings"
                  value={landings}
                  onChange={(e) =>
                    setLandings(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="e.g. 8412"
                  inputMode="numeric"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Current:{" "}
                  <span className="font-mono">
                    {aircraft.totalLandings ?? "—"}
                  </span>
                </p>
              </div>
            )}

            {(isDecrement || isLandingsDecrement) && (
              <p className="rounded-md border border-sev-yellow-edge/60 bg-sev-yellow-bg/40 px-3 py-2 text-sm text-sev-yellow-fg">
                You're <b>decreasing</b>{" "}
                {isDecrement && isLandingsDecrement
                  ? "TTAF and landings"
                  : isDecrement
                    ? "TTAF"
                    : "landings"}
                . Make sure this is intentional —
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
              {saving ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
