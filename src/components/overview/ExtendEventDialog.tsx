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
  MAX_EXTENSION_HOURS,
  clearEventExtension,
  extendEvent,
} from "@/services/events";
import { formatMinutesAsDuration } from "@/lib/time";
import { getEffectiveTimerExpiryMinutes } from "@/lib/eventStatus";
import type { MaintenanceEvent } from "@/types";

type Props = {
  event: MaintenanceEvent | null;
  onClose: () => void;
};

export default function ExtendEventDialog({ event, onClose }: Props) {
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setHours(
        event.extensionMinutes != null
          ? String(event.extensionMinutes / 60)
          : "",
      );
      setError(null);
      setSaving(null);
    }
  }, [event]);

  if (!event) return null;

  const wasExtended = event.extensionMinutes != null;
  const prevHours = event.extensionMinutes != null
    ? event.extensionMinutes / 60
    : null;
  const baseExpiry = event.timerExpiryTimeMinutes;
  const effectiveExpiry = getEffectiveTimerExpiryMinutes(event);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(hours);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a positive number of hours.");
      return;
    }
    if (parsed > MAX_EXTENSION_HOURS) {
      setError(
        `The CAMO can grant at most ${MAX_EXTENSION_HOURS}h per interval.`,
      );
      return;
    }
    setSaving("save");
    try {
      await extendEvent(event.id, parsed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extend.");
    } finally {
      setSaving(null);
    }
  };

  const onClear = async () => {
    setError(null);
    setSaving("clear");
    try {
      await clearEventExtension(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear.");
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;
  const submitLabel = wasExtended ? "Update extension" : "Grant extension";

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {wasExtended ? "Manage extension" : "Extend TTAF due"} — {event.tailNumber}
            </DialogTitle>
            <DialogDescription>"{event.warning}"</DialogDescription>
          </DialogHeader>

          {baseExpiry == null ? (
            <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              This event has no TTAF expiry — extensions only apply to
              hours-based events.
            </p>
          ) : (
            <div className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Original TTAF due</span>
                <span className="font-mono tabular-nums">
                  {formatMinutesAsDuration(baseExpiry)}
                </span>
              </div>
              {wasExtended && (
                <>
                  <div className="flex items-center justify-between text-amber-800">
                    <span>Current extension</span>
                    <span className="font-mono tabular-nums">
                      +{prevHours}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span>Effective TTAF due</span>
                    <span className="font-mono tabular-nums">
                      {formatMinutesAsDuration(effectiveExpiry)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="py-4 space-y-2">
            <Label htmlFor="extHours">
              Extension hours (max {MAX_EXTENSION_HOURS})
            </Label>
            <Input
              id="extHours"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_EXTENSION_HOURS}
              step="1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
              autoFocus
              placeholder={`e.g. 5`}
              className="font-mono"
              disabled={baseExpiry == null}
            />
            <p className="text-xs text-muted-foreground">
              CAMO authority. The extension resets automatically when the event
              is closed (next interval starts fresh).
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="flex sm:justify-between sm:items-center">
            {wasExtended ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onClear}
                disabled={busy}
                className="text-rose-700 hover:bg-rose-100 hover:text-rose-800"
              >
                {saving === "clear" ? "Removing…" : "Remove extension"}
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
              <Button type="submit" disabled={busy || baseExpiry == null}>
                {saving === "save" ? "Saving…" : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
