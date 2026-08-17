import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { groundAircraft, setOutOfProduction } from "@/services/aircraft";
import { useAuth } from "@/context/AuthContext";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

// "ground" = urgent/AOG grounding that needs a cause and can auto-lift.
// "out-of-production" = a deliberate, non-urgent parking (not yet enrolled,
// pending legal work, long-term storage) that only lifts on return to service.
type Mode = "ground" | "out-of-production";

type CauseKind = "defect" | "event" | "other";

const MAX_REASON_LENGTH = 300;

type Props = {
  // Non-null means "open the grounding dialog for this aircraft". The dialog
  // is suppressed entirely while the aircraft is already grounded — the
  // overview goes straight to liftGrounding for the toggle-back path.
  aircraft: Aircraft | null;
  // Open defects/events on this tail. Resolved items are filtered out
  // upstream so the dropdowns never offer something that won't auto-lift.
  openDefects: Defect[];
  openEvents: MaintenanceEvent[];
  onClose: () => void;
};

export default function GroundingDialog({
  aircraft,
  openDefects,
  openEvents,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("ground");
  const [kind, setKind] = useState<CauseKind>("defect");
  const [defectId, setDefectId] = useState<string>("");
  const [eventId, setEventId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [oopReason, setOopReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the cause type to whichever option is actually available on this
  // tail (defect first, then event, then "other"). Saves a click in the
  // common case where the grounded aircraft already has an open defect.
  const defaultKind: CauseKind = useMemo(() => {
    if (openDefects.length > 0) return "defect";
    if (openEvents.length > 0) return "event";
    return "other";
  }, [openDefects.length, openEvents.length]);

  useEffect(() => {
    if (aircraft) {
      setMode("ground");
      setKind(defaultKind);
      setDefectId(openDefects[0]?.id ?? "");
      setEventId(openEvents[0]?.id ?? "");
      setReason("");
      setOopReason("");
      setError(null);
      setSaving(false);
    }
  }, [aircraft, defaultKind, openDefects, openEvents]);

  if (!aircraft) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (mode === "out-of-production") {
        const trimmed = oopReason.trim();
        if (!trimmed) {
          setError("A reason is required.");
          setSaving(false);
          return;
        }
        await setOutOfProduction(aircraft.tailNumber, trimmed, user.uid);
        onClose();
        return;
      }
      if (kind === "defect") {
        const d = openDefects.find((x) => x.id === defectId);
        if (!d) {
          setError("Pick a defect to link.");
          setSaving(false);
          return;
        }
        await groundAircraft(
          aircraft.tailNumber,
          { type: "defect", defectId: d.id, defectTitle: d.title },
          user.uid,
        );
      } else if (kind === "event") {
        const ev = openEvents.find((x) => x.id === eventId);
        if (!ev) {
          setError("Pick an event to link.");
          setSaving(false);
          return;
        }
        await groundAircraft(
          aircraft.tailNumber,
          {
            type: "event",
            eventId: ev.id,
            eventTitle: ev.warning,
            workOrderNumber: ev.workOrderNumber ?? null,
          },
          user.uid,
        );
      } else {
        const trimmed = reason.trim();
        if (!trimmed) {
          setError("A reason is required.");
          setSaving(false);
          return;
        }
        await groundAircraft(
          aircraft.tailNumber,
          { type: "other", reason: trimmed },
          user.uid,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ground.");
      setSaving(false);
    }
  };

  const noDefects = openDefects.length === 0;
  const noEvents = openEvents.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "ground" ? "Ground" : "Take out of production"}{" "}
              {aircraft.tailNumber}
            </DialogTitle>
            <DialogDescription>
              {mode === "ground"
                ? "A grounding is for an unserviceable / AOG aircraft that needs attention. Every grounding needs a cause — link it to the open defect or event keeping the aircraft down, or pick \"other\". Resolving a linked defect or closing a linked event auto-lifts the grounding."
                : "Out of production is for an aircraft deliberately parked outside the operational cycle for non-urgent reasons — not yet enrolled, pending legal work, long-term storage. It won't be flagged for attention and only clears when you return it to service."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium mb-1">Status</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "ground", label: "Ground (AOG)" },
                    {
                      value: "out-of-production",
                      label: "Out of production",
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
                      mode === opt.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-secondary/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="statusMode"
                      value={opt.value}
                      checked={mode === opt.value}
                      onChange={() => setMode(opt.value)}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === "ground" && (
            <>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium mb-1">Cause type</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "defect", label: "Defect", disabled: noDefects },
                    { value: "event", label: "Maintenance event", disabled: noEvents },
                    { value: "other", label: "Other", disabled: false },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
                      opt.disabled
                        ? "opacity-40 cursor-not-allowed"
                        : kind === opt.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-secondary/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="causeKind"
                      value={opt.value}
                      checked={kind === opt.value}
                      onChange={() => !opt.disabled && setKind(opt.value)}
                      disabled={opt.disabled}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {noDefects && noEvents && (
                <p className="text-xs text-muted-foreground">
                  No open defects or events on this tail. Use "Other" to
                  capture the reason as free text, or add a defect first if
                  one applies.
                </p>
              )}
            </fieldset>

            {kind === "defect" && (
              <div className="space-y-2">
                <Label htmlFor="groundDefect">Linked defect</Label>
                <select
                  id="groundDefect"
                  value={defectId}
                  onChange={(e) => setDefectId(e.target.value)}
                  disabled={noDefects}
                  className="flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {openDefects.map((d) => {
                    const wo = d.workOrderNumber?.trim();
                    const label = wo ? `${wo} · ${d.title}` : d.title;
                    return (
                      <option key={d.id} value={d.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-muted-foreground">
                  Resolving this defect (WO# + date) will automatically lift
                  the grounding.
                </p>
              </div>
            )}

            {kind === "event" && (
              <div className="space-y-2">
                <Label htmlFor="groundEvent">Linked maintenance event</Label>
                <select
                  id="groundEvent"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  disabled={noEvents}
                  className="flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {openEvents.map((ev) => {
                    const wo = ev.workOrderNumber?.trim();
                    const label = wo ? `${wo} · ${ev.warning}` : ev.warning;
                    return (
                      <option key={ev.id} value={ev.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-muted-foreground">
                  Closing this event will automatically lift the grounding.
                </p>
              </div>
            )}

            {kind === "other" && (
              <div className="space-y-2">
                <Label htmlFor="groundReason">Reason</Label>
                <textarea
                  id="groundReason"
                  value={reason}
                  onChange={(e) =>
                    setReason(e.target.value.slice(0, MAX_REASON_LENGTH))
                  }
                  rows={3}
                  autoFocus
                  placeholder="e.g. Parts AOG — awaiting prop overhaul kit (ETA 2 weeks)"
                  className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                  {MAX_REASON_LENGTH - reason.length} characters left
                </p>
                <p className="text-xs text-muted-foreground">
                  "Other" groundings don't auto-lift — toggle back to
                  Airworthy when the cause is resolved.
                </p>
              </div>
            )}
            </>
            )}

            {mode === "out-of-production" && (
              <div className="space-y-2">
                <Label htmlFor="oopReason">Reason</Label>
                <textarea
                  id="oopReason"
                  value={oopReason}
                  onChange={(e) =>
                    setOopReason(e.target.value.slice(0, MAX_REASON_LENGTH))
                  }
                  rows={3}
                  autoFocus
                  placeholder="e.g. Not yet enrolled in the tracker · Pending legal work post-assembly"
                  className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                  {MAX_REASON_LENGTH - oopReason.length} characters left
                </p>
                <p className="text-xs text-muted-foreground">
                  Out-of-production aircraft aren't flagged for attention and
                  drop out of the severity, missing-events and booking checks.
                  Return to service from the status chip when they're back in
                  the cycle.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {mode === "ground"
                ? saving
                  ? "Grounding…"
                  : "Ground aircraft"
                : saving
                  ? "Saving…"
                  : "Mark out of production"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
