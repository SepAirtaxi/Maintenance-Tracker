import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
  bulkCloseEvents,
  subscribeEvents,
  type WipeEventsResult,
} from "@/services/events";
import { useAuth } from "@/context/AuthContext";
import type { MaintenanceEvent } from "@/types";

const DEFAULT_REASON = "Wiped due to stale data";
const CONFIRM_WORD = "WIPE";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function WipeEventsDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [allEvents, setAllEvents] = useState<MaintenanceEvent[]>([]);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WipeEventsResult | null>(null);

  // Read the same live event feed the Overview uses, so the wipe closes exactly
  // the events the app shows. Kept live the whole time the dialog is mounted.
  useEffect(() => subscribeEvents(setAllEvents), []);

  // Open = not yet closed. Mirrors the Overview's `if (e.resolvedAt) continue`.
  const openEvents = useMemo(
    () => allEvents.filter((e) => e.resolvedAt == null),
    [allEvents],
  );

  // Reset every time the dialog is opened — it stays mounted between uses.
  useEffect(() => {
    if (open) {
      setReason(DEFAULT_REASON);
      setConfirmText("");
      setWorking(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const trimmedReason = reason.trim();
  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const canRun =
    confirmed &&
    trimmedReason.length > 0 &&
    openEvents.length > 0 &&
    !working &&
    !!user;

  const onConfirm = async () => {
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    if (!canRun) return;
    setWorking(true);
    setError(null);
    try {
      const res = await bulkCloseEvents(
        openEvents.map((e) => e.id),
        user.uid,
        trimmedReason,
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wipe failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-sev-red-fg" />
            Wipe all open events?
          </DialogTitle>
          <DialogDescription>
            Administratively closes every currently-open event across the whole
            fleet. Nothing is deleted — each event is closed (no work order, no
            TTAF) with the note below, so it stays on the aircraft history and
            audit log. Already-closed events are untouched.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="border border-sev-green-edge/50 bg-sev-green-bg/60 px-3 py-2 text-sm text-sev-green-fg">
            {result.total === 0
              ? "No open events found — nothing to close."
              : `Closed ${result.closed} of ${result.total} open event${
                  result.total === 1 ? "" : "s"
                }.`}
            {result.failed > 0 && (
              <span className="block font-semibold text-sev-red-fg">
                {result.failed} failed to close — try again to retry those.
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border border-foreground/15 bg-muted/40 px-3 py-2 text-sm">
              {openEvents.length === 0 ? (
                <span className="text-muted-foreground">
                  No open events to close.
                </span>
              ) : (
                <>
                  This will close{" "}
                  <span className="font-mono font-semibold">
                    {openEvents.length}
                  </span>{" "}
                  open event{openEvents.length === 1 ? "" : "s"}.
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wipe-reason">Close note (stored on each event)</Label>
              <Input
                id="wipe-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={working}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wipe-confirm">
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span>{" "}
                to confirm
              </Label>
              <Input
                id="wipe-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                disabled={working}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={working}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={onConfirm}
                disabled={!canRun}
              >
                {working ? "Closing…" : "Wipe open events"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
