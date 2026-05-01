import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { createBooking, deleteBooking, updateBooking } from "@/services/bookings";
import { subscribeLocations } from "@/services/locations";
import { normaliseTailNumber } from "@/lib/tails";
import { cn } from "@/lib/utils";
import type { Aircraft, Booking, Defect, Location, MaintenanceEvent } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fleet: Aircraft[];
  // All maintenance events. The dialog filters by the selected tail and
  // unresolved status, plus keeps the currently linked event in scope even
  // if it's been resolved or moved.
  events: MaintenanceEvent[];
  // All defects. Same filtering rules as events.
  defects: Defect[];
  // Edit mode: pass the booking to edit. Create mode: pass null.
  booking: Booking | null;
  // Create-mode prefill (tail & from date).
  prefill?: { tailNumber?: string; from?: Date | null };
};

function tsToInputDate(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  return dateToInputDate(ts.toDate());
}

function dateToInputDate(d: Date): string {
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

export default function BookingDialog({
  open,
  onOpenChange,
  fleet,
  events,
  defects,
  booking,
  prefill,
}: Props) {
  const isEdit = booking !== null;
  const [tail, setTail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [eventId, setEventId] = useState<string>("");
  const [defectIds, setDefectIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    return subscribeLocations(setLocations);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (booking) {
      setTail(booking.tailNumber);
      setFrom(tsToInputDate(booking.from));
      setTo(tsToInputDate(booking.to));
      setOpenEnded(booking.to == null);
      setEventId(booking.eventId ?? "");
      setDefectIds(booking.defectIds ?? []);
      setLocationId(booking.locationId ?? "");
      setNotes(booking.notes ?? "");
    } else {
      setTail(prefill?.tailNumber ?? "");
      setFrom(prefill?.from ? dateToInputDate(prefill.from) : "");
      setTo("");
      setOpenEnded(false);
      setEventId("");
      setDefectIds([]);
      setLocationId("");
      setNotes("");
    }
    setError(null);
    setSaving(false);
    setDeleting(false);
    setConfirmingDelete(false);
  }, [open, booking, prefill]);

  const tailOptions = useMemo(
    () => fleet.map((a) => a.tailNumber).sort((a, b) => a.localeCompare(b)),
    [fleet],
  );

  const normalisedTail = normaliseTailNumber(tail);

  const eventOptions = useMemo(() => {
    const list = events
      .filter((e) => e.tailNumber === normalisedTail && !e.resolvedAt)
      .sort((a, b) => a.warning.localeCompare(b.warning));
    // Keep a currently-linked event visible even if it's resolved or has
    // moved tails — so the user can read what's there and pick a new one.
    if (booking?.eventId) {
      const linked = events.find((e) => e.id === booking.eventId);
      if (linked && !list.some((e) => e.id === linked.id)) {
        list.unshift(linked);
      }
    }
    return list;
  }, [events, normalisedTail, booking?.eventId]);

  const defectOptions = useMemo(() => {
    const list = defects
      .filter((d) => d.tailNumber === normalisedTail && !d.resolvedAt)
      .sort((a, b) => a.title.localeCompare(b.title));
    // Keep currently-linked defects visible even if they're resolved.
    const linkedIds = booking?.defectIds ?? [];
    for (const id of linkedIds) {
      if (!list.some((d) => d.id === id)) {
        const linked = defects.find((d) => d.id === id);
        if (linked) list.unshift(linked);
      }
    }
    return list;
  }, [defects, normalisedTail, booking?.defectIds]);

  // When the tail changes (in create mode), drop stale event/defect links.
  useEffect(() => {
    if (isEdit) return;
    if (eventId && !eventOptions.some((e) => e.id === eventId)) {
      setEventId("");
    }
    setDefectIds((prev) => {
      const next = prev.filter((id) =>
        defectOptions.some((d) => d.id === id),
      );
      return next.length === prev.length ? prev : next;
    });
  }, [normalisedTail, eventOptions, defectOptions, eventId, isEdit]);

  const toggleDefect = (id: string) => {
    setDefectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!normalisedTail) {
      setError("Tail number is required.");
      return;
    }
    if (!fleet.some((a) => a.tailNumber === normalisedTail)) {
      setError(`Unknown tail number: ${normalisedTail}.`);
      return;
    }
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
      if (toDate < fromDate) {
        setError("'To' date must be on or after 'From' date.");
        return;
      }
    }
    setSaving(true);
    try {
      if (isEdit && booking) {
        await updateBooking(booking.id, {
          tailNumber: normalisedTail,
          from: fromDate,
          to: toDate,
          eventId: eventId || null,
          defectIds,
          locationId: locationId || null,
          notes,
        });
      } else {
        await createBooking({
          tailNumber: normalisedTail,
          from: fromDate,
          to: toDate,
          eventId: eventId || null,
          defectIds,
          locationId: locationId || null,
          notes: notes || null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!booking) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBooking(booking.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setDeleting(false);
    }
  };

  const eventSelectDisabled = !normalisedTail || eventOptions.length === 0;
  const defectSelectDisabled = !normalisedTail || defectOptions.length === 0;

  const locationOptions = useMemo(() => {
    const active = locations.filter((l) => l.active);
    // Keep an inactive but currently-selected location visible so the user can
    // still see/edit it.
    if (locationId && !active.some((l) => l.id === locationId)) {
      const linked = locations.find((l) => l.id === locationId);
      if (linked) return [linked, ...active];
    }
    return active;
  }, [locations, locationId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden">
        <form onSubmit={onSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Edit booking — ${booking?.tailNumber}` : "New booking"}
            </DialogTitle>
            <DialogDescription>
              Books an aircraft into the maintenance hangar. Link an event
              from the overview to surface its WO# on the calendar block.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="bookingTail">Tail number</Label>
              <Input
                id="bookingTail"
                value={tail}
                onChange={(e) => setTail(e.target.value.toUpperCase())}
                list="bookingTailList"
                placeholder="OY-..."
                disabled={isEdit}
                autoFocus={!isEdit}
                className="font-mono"
                required
              />
              <datalist id="bookingTailList">
                {tailOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="bookingFrom">From</Label>
                <Input
                  id="bookingFrom"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label
                  htmlFor="bookingTo"
                  className={openEnded ? "text-muted-foreground" : undefined}
                >
                  To
                </Label>
                <Input
                  id="bookingTo"
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

            <div className="space-y-2">
              <Label htmlFor="bookingEvent">Linked event (optional)</Label>
              <select
                id="bookingEvent"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                disabled={eventSelectDisabled}
                className="flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— None / custom block —</option>
                {eventOptions.map((e) => {
                  const wo = e.workOrderNumber?.trim();
                  const label = wo ? `${wo} · ${e.warning}` : e.warning;
                  return (
                    <option key={e.id} value={e.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                {!normalisedTail
                  ? "Pick a tail number to see its events."
                  : eventOptions.length === 0
                    ? "No open events on this tail. Add one from the overview if you want to link."
                    : "WO# (if set) and the event name will appear on the calendar block."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Linked defects (optional)</Label>
              {defectSelectDisabled ? (
                <p className="text-xs text-muted-foreground">
                  {!normalisedTail
                    ? "Pick a tail number to see its defects."
                    : "No open defects on this tail."}
                </p>
              ) : (
                <div className="rounded-md border bg-card max-h-40 overflow-y-auto overflow-x-hidden">
                  {defectOptions.map((d) => {
                    const checked = defectIds.includes(d.id);
                    const wo = d.workOrderNumber?.trim();
                    const resolved = !!d.resolvedAt;
                    return (
                      <label
                        key={d.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-secondary/60 border-b last:border-b-0 min-w-0",
                          resolved && "text-muted-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDefect(d.id)}
                          className="h-3.5 w-3.5 rounded border-input shrink-0"
                        />
                        {wo && (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold">
                            WO: {wo}
                          </span>
                        )}
                        <span
                          className={cn(
                            "flex-1 min-w-0 truncate",
                            resolved && "line-through",
                          )}
                          title={d.title}
                        >
                          {d.title}
                        </span>
                        {resolved && (
                          <span className="shrink-0 text-[10px] italic">
                            resolved
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Defects sharing a WO# with the linked event are grouped under
                that WO on the calendar block.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookingLocation">Location (optional)</Label>
              <select
                id="bookingLocation"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={locationOptions.length === 0}
                className="flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— No location —</option>
                {locationOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.active === false ? " (inactive)" : ""}
                    {l.kind === "external" ? " · external" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {locationOptions.length === 0
                  ? "Add hangars/locations under Settings → Locations to assign one."
                  : "Where the aircraft will be parked during this booking."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookingNotes">Notes (optional)</Label>
              <Input
                id="bookingNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Wing inspection, awaiting parts"
              />
              <p className="text-xs text-muted-foreground">
                Free text. Visible on the block when there's room, otherwise
                shown on hover.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between sm:items-center">
            <div>
              {isEdit && (
                confirmingDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">Delete?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={onDelete}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={saving || deleting}
                    className="text-destructive hover:text-destructive"
                  >
                    Delete
                  </Button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving || deleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || deleting}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create booking"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
