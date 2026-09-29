import { useMemo } from "react";
import { Building2, Check, MapPin, Pencil, StickyNote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBookingRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  Booking,
  BookingItemResolution,
  Defect,
  Location,
  MaintenanceEvent,
} from "@/types";

type Props = {
  booking: Booking | null;
  events: MaintenanceEvent[];
  defects: Defect[];
  locations: Location[];
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
  locations,
  onClose,
  onEdit,
  readOnly,
}: Props) {
  const linkedLocation = useMemo(() => {
    if (!booking?.locationId) return null;
    return locations.find((l) => l.id === booking.locationId) ?? null;
  }, [booking, locations]);
  const linkedEvents = useMemo(() => {
    if (!booking) return [] as MaintenanceEvent[];
    const ids = booking.eventIds ?? [];
    return ids
      .map((id) => events.find((e) => e.id === id))
      .filter((e): e is MaintenanceEvent => !!e);
  }, [booking, events]);

  const linkedDefects = useMemo(() => {
    if (!booking) return [] as Defect[];
    const ids = booking.defectIds ?? [];
    return ids
      .map((id) => defects.find((d) => d.id === id))
      .filter((d): d is Defect => !!d);
  }, [booking, defects]);

  const eventRows: WorkRow[] = useMemo(() => {
    const snaps = booking?.itemResolutions ?? null;
    return linkedEvents.map((e) => {
      const snap = snaps?.[e.id] ?? null;
      return {
        key: e.id,
        kind: "event" as const,
        label: snap?.label ?? e.warning,
        woq: e.quoteNumber?.trim() || null,
        wo:
          (snap?.kind === "resolved" ? snap.workOrder : e.workOrderNumber)?.trim() ||
          null,
        status: snap ? snap.kind : e.resolvedAt ? "resolved" : "open",
        resolution: snap,
      };
    });
  }, [booking, linkedEvents]);

  const defectRows: WorkRow[] = useMemo(() => {
    const snaps = booking?.itemResolutions ?? null;
    return linkedDefects.map((d) => {
      const snap = snaps?.[d.id] ?? null;
      const liveStatus: WorkStatus = d.resolvedAt
        ? d.resolutionKind === "nff"
          ? "nff"
          : "resolved"
        : d.deferredAt
          ? "deferred"
          : "open";
      return {
        key: d.id,
        kind: "defect" as const,
        label: snap?.label ?? d.title,
        woq: d.quoteNumber?.trim() || null,
        wo:
          (snap?.kind === "resolved" || snap?.kind === "nff"
            ? snap.workOrder
            : d.workOrderNumber
          )?.trim() || null,
        status: snap ? snap.kind : liveStatus,
        resolution: snap,
      };
    });
  }, [booking, linkedDefects]);

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
      <DialogContent className="max-w-3xl">
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
            <div className="border border-foreground/15 bg-card px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hangar period
              </div>
              <div className="font-mono text-sm tabular-nums mt-0.5">
                {formatBookingRange(booking.from, booking.to)}
              </div>
            </div>
            <div className="border border-foreground/15 bg-card px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Duration
              </div>
              <div className="text-sm mt-0.5">{durationLabel}</div>
            </div>
          </div>

          {linkedLocation && (
            <div className="border border-foreground/15 bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {linkedLocation.kind === "external" ? (
                  <MapPin className="h-3 w-3" />
                ) : (
                  <Building2 className="h-3 w-3" />
                )}
                Location
              </div>
              <div className="text-sm mt-0.5 flex items-center gap-2">
                <span className="font-medium">{linkedLocation.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {linkedLocation.kind === "external"
                    ? "external / sub-contractor"
                    : "own hangar"}
                </span>
                {!linkedLocation.active && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground italic">
                    inactive
                  </span>
                )}
              </div>
              {linkedLocation.notes && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {linkedLocation.notes}
                </div>
              )}
            </div>
          )}

          <div className="border border-foreground/15 bg-card">
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Work
            </div>
            {eventRows.length === 0 && defectRows.length === 0 ? (
              <div className="px-3 pb-2 text-sm text-muted-foreground italic">
                No event or defects linked.
              </div>
            ) : (
              // Drop the final row's rule so it doesn't double up with the box border.
              <div className="text-sm [&>div:last-child>div:last-child]:border-b-0">
                <div
                  className={cn(
                    WORK_GRID_COLS,
                    "border-y border-foreground/15 bg-foreground/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-spec text-muted-foreground",
                  )}
                >
                  <span>Item</span>
                  <span>Type</span>
                  <span>WOQ</span>
                  <span>WO</span>
                  <span>Status</span>
                </div>
                <WorkSection label="Events" rows={eventRows} tone="green" />
                <WorkSection label="Defects" rows={defectRows} tone="yellow" />
              </div>
            )}
          </div>

          {notes && (
            <div className="border border-foreground/15 bg-card px-3 py-2">
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

type WorkStatus = "open" | "resolved" | "nff" | "deferred";

type WorkRow = {
  key: string;
  kind: "event" | "defect";
  label: string;
  woq: string | null;
  wo: string | null;
  status: WorkStatus;
  resolution: BookingItemResolution | null;
};

// Item | Type | WOQ | WO | Status — shared by the header row and every
// data row so the columns line up across the Events and Defects sections.
// WOQ / WO are 100px so the ERP's 11-char ids (e.g. "WOQ26-00024") fit
// without truncating — same width as the overview ledger.
const WORK_GRID_COLS =
  "grid grid-cols-[minmax(0,1fr)_64px_100px_100px_84px] items-center gap-x-3";

function WorkSection({
  label,
  rows,
  tone,
}: {
  label: string;
  rows: WorkRow[];
  tone: "green" | "yellow";
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div
        className={cn(
          "border-b border-foreground/10 px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-spec",
          tone === "green"
            ? "bg-sev-green-bg text-sev-green-fg"
            : "bg-sev-yellow-bg text-sev-yellow-fg",
        )}
      >
        {label} · {rows.length}
      </div>
      {rows.map((r) => {
        // Strike only true closures (resolved/NFF). Deferred items stay open
        // visually but get the deferred status.
        const strike = r.status === "resolved" || r.status === "nff";
        return (
          <div
            key={r.key}
            className={cn(
              WORK_GRID_COLS,
              "border-b border-foreground/10 px-3 py-1.5",
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-1",
                strike && "line-through opacity-60",
              )}
              title={r.label}
            >
              {strike && (
                <Check className="h-3 w-3 shrink-0 text-sev-green-fg/80" />
              )}
              <span className="truncate font-medium">
                {r.label}
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {r.kind}
            </span>
            <MonoCell value={r.woq} />
            <MonoCell value={r.wo} />
            <StatusCell status={r.status} resolution={r.resolution} />
          </div>
        );
      })}
    </div>
  );
}

function MonoCell({ value }: { value: string | null }) {
  return value ? (
    <span className="truncate font-mono text-[12px] tabular-nums" title={value}>
      {value}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function StatusCell({
  status,
  resolution,
}: {
  status: WorkStatus;
  resolution: BookingItemResolution | null;
}) {
  const base = "text-[10px] font-bold uppercase tracking-spec";
  if (status === "resolved") {
    return <span className={cn(base, "text-sev-green-fg")}>Resolved</span>;
  }
  if (status === "nff") {
    return <span className={cn(base, "text-foreground")}>NFF</span>;
  }
  if (status === "deferred") {
    return (
      <span
        className={cn(base, "text-sev-yellow-fg")}
        title={resolution?.reason ?? undefined}
      >
        Deferred
      </span>
    );
  }
  return <span className={cn(base, "text-muted-foreground")}>Open</span>;
}
