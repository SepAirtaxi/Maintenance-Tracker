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
import { deferDefect, undeferDefect } from "@/services/defects";
import { useAuth } from "@/context/AuthContext";
import {
  DEFERRAL_REVIEW_DAYS,
  daysSinceDeferred,
  getDeferralStatus,
} from "@/lib/eventStatus";
import { formatDate } from "@/lib/format";
import type { Defect } from "@/types";

const MAX_REASON_LENGTH = 300;

type Props = {
  defect: Defect | null;
  onClose: () => void;
};

export default function DeferDefectDialog({ defect, onClose }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<"defer" | "lift" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defect) {
      setReason("");
      setError(null);
      setSaving(null);
    }
  }, [defect]);

  if (!defect) return null;

  const wasDeferred = defect.deferredAt != null;
  const status = getDeferralStatus(defect);
  const elapsed = daysSinceDeferred(defect);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required to defer this defect.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setSaving("defer");
    try {
      await deferDefect(defect.id, reason, user.uid);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to defer.");
    } finally {
      setSaving(null);
    }
  };

  const onLift = async () => {
    setError(null);
    setSaving("lift");
    try {
      await undeferDefect(defect.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lift deferral.");
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;
  const remaining = MAX_REASON_LENGTH - reason.length;
  const submitLabel = wasDeferred ? "Re-defer (reset 30d)" : "Defer (start 30d)";

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {wasDeferred ? "Manage deferral" : "Defer defect"} — {defect.tailNumber}
            </DialogTitle>
            <DialogDescription>"{defect.title}"</DialogDescription>
          </DialogHeader>

          {wasDeferred && defect.deferredAt && (
            <div
              className={
                status === "overdue"
                  ? "mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900"
                  : "mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              }
            >
              <p className="font-medium">
                {status === "overdue"
                  ? `Review overdue — ${elapsed}d since deferral (limit ${DEFERRAL_REVIEW_DAYS}d).`
                  : `Currently deferred — ${elapsed}d of ${DEFERRAL_REVIEW_DAYS}d elapsed.`}
              </p>
              <p className="mt-1 opacity-90">
                Deferred {formatDate(defect.deferredAt)}
                {defect.deferralReason ? ` · "${defect.deferralReason}"` : ""}
              </p>
              <p className="mt-1 opacity-80">
                Re-deferring resets the 30-day timer from today.
              </p>
            </div>
          )}

          <div className="py-4 space-y-2">
            <Label htmlFor="deferReason">
              Reason{wasDeferred ? " (for re-deferral)" : ""}
            </Label>
            <textarea
              id="deferReason"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value.slice(0, MAX_REASON_LENGTH))
              }
              rows={3}
              autoFocus
              required
              placeholder="e.g. Awaiting spare part, MM allows operation until next inspection."
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
            {wasDeferred ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onLift}
                disabled={busy}
                className="text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
              >
                {saving === "lift" ? "Lifting…" : "Lift deferral"}
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
              <Button type="submit" disabled={busy}>
                {saving === "defer" ? "Saving…" : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
