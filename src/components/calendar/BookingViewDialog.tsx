import { Fragment, useMemo } from "react";
import { Check, Pencil, StickyNote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  buildBookingGroups,
  type BookingGroup,
} from "@/lib/bookingDisplay";
import { formatBookingRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Booking, Defect, MaintenanceEvent } from "@/types";

type Props = {
  booking: Booking | null;
  events: MaintenanceEvent[];
  defects: Defect[];
  onClose: () => void;
  onEdit: () => void;
  readOnly: boolean;
};

function daysBetween(fromMs: number, toMs: number): number {
  const day = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((toMs - fromMs) / day) + 1);
}

export default function BookingViewDialog({
  booking,
  events,
  defects,
  onClose,
  onEdit,
  readOnly,
}: Props) {
  const linkedEvent = useMemo(() => {
    if (!booking?.eventId) return null;
    return events.find((e) => e.id === booking.eventId) ?? null;
  }, [booking, events]);

  const linkedDefects = useMemo(() => {
    if (!booking) return [] as Defect[];
    const ids = booking.defectIds ?? [];
    return ids
      .map((id) => defects.find((d) => d.id === id))
      .filter((d): d is Defect => !!d);
  }, [booking, defects]);

  const groups: BookingGroup[] = useMemo(
    () => (booking ? buildBookingGroups(linkedEvent, linkedDefects) : []),
    [booking, linkedEvent, linkedDefects],
  );

  if (!booking) return null;

  const fromMs = booking.from.toMillis();
  const toMs = booking.to ? booking.to.toMillis() : null;
  const durationLabel =
    toMs == null
      ? "Open-ended"
      : (() => {
          const n = daysBetween(fromMs, toMs);
          return n === 1 ? "1 day" : `${n} days`;
        })();

  const notes = booking.notes?.trim() || "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{booking.tailNumber}</span>
            <span className="text-muted-foreground font-normal text-sm">
              · Booking
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hangar period
              </div>
              <div className="font-mono text-sm tabular-nums mt-0.5">
                {formatBookingRange(booking.from, booking.to)}
              </div>
            </div>
            <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Duration
              </div>
              <div className="text-sm mt-0.5">{durationLabel}</div>
            </div>
          </div>

          <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Work
            </div>
            {groups.length === 0 ? (
              <div className="mt-1 text-sm text-muted-foreground italic">
                No event or defects linked.
              </div>
            ) : (
              <div className="mt-1 space-y-1.5">
                {groups.map((g, gi) => (
                  <div
                    key={gi}
                    className="flex items-start gap-2 text-sm leading-snug"
                  >
                    {g.wo ? (
                      <span className="shrink-0 rounded bg-sky-100 text-sky-900 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                        WO: {g.wo}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
                        No WO
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      {g.items.map((it, ii) => (
                        <Fragment key={ii}>
                          {ii > 0 && (
                            <span className="text-muted-foreground"> · </span>
                          )}
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              it.resolved && "line-through opacity-60",
                            )}
                          >
                            {it.resolved && (
                              <Check className="h-3 w-3 text-emerald-600" />
                            )}
                            <span
                              className={cn(
                                it.kind === "event"
                                  ? "font-medium"
                                  : "text-foreground/90",
                              )}
                            >
                              {it.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {it.kind}
                            </span>
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notes && (
            <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3 w-3" />
                Notes
              </div>
              <div className="text-sm mt-1 whitespace-pre-wrap">{notes}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {!readOnly && (
            <Button type="button" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
