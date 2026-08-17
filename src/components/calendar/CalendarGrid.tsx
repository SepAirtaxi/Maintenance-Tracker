import { Fragment, useMemo } from "react";
import { format, getISOWeek, isSameDay, isToday } from "date-fns";
import { Building2, Check, MapPin, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAircraftStatus } from "@/lib/aircraftStatus";
import {
  buildBookingGroups,
  describeBookingGroups,
} from "@/lib/bookingDisplay";
import type {
  Aircraft,
  Booking,
  Defect,
  Location,
  MaintenanceEvent,
} from "@/types";

type Props = {
  days: Date[];
  fleet: Aircraft[];
  bookings: Booking[];
  events: MaintenanceEvent[];
  defects: Defect[];
  locations: Location[];
  viewMode: "week" | "month";
  readOnly: boolean;
  onSelectBooking: (booking: Booking) => void;
  onCreateForCell: (tail: string, day: Date) => void;
};

const TAIL_COL_PX = 84;
const ROW_HEIGHT_PX = 36;
const HEADER_HEIGHT_PX = 36;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Returns column indices [start, end] (inclusive) for a booking on the given
// day window. If the booking lies entirely outside the window, returns null.
function bookingColumns(
  booking: Booking,
  days: Date[],
): { startCol: number; endCol: number; clippedLeft: boolean; clippedRight: boolean; openEnded: boolean } | null {
  const winStartMs = startOfDay(days[0]).getTime();
  const winEndMs = endOfDay(days[days.length - 1]).getTime();
  const fromMs = booking.from.toMillis();
  const toMs = booking.to ? endOfDay(booking.to.toDate()).getTime() : Number.POSITIVE_INFINITY;

  if (fromMs > winEndMs) return null;
  if (toMs < winStartMs) return null;

  let startCol = 0;
  let clippedLeft = false;
  if (fromMs >= winStartMs) {
    // Find first day index where day >= booking.from (calendar day match).
    for (let i = 0; i < days.length; i++) {
      if (isSameDay(days[i], booking.from.toDate())) {
        startCol = i;
        break;
      }
      if (days[i].getTime() > booking.from.toMillis()) {
        startCol = i;
        break;
      }
    }
  } else {
    clippedLeft = true;
    startCol = 0;
  }

  let endCol = days.length - 1;
  let clippedRight = false;
  const openEnded = booking.to == null;
  if (booking.to && toMs <= winEndMs) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (isSameDay(days[i], booking.to.toDate())) {
        endCol = i;
        break;
      }
      if (days[i].getTime() < booking.to.toMillis()) {
        endCol = i;
        break;
      }
    }
  } else {
    clippedRight = true;
    endCol = days.length - 1;
  }

  if (endCol < startCol) endCol = startCol;
  return { startCol, endCol, clippedLeft, clippedRight, openEnded };
}

function isBookingActiveOnNow(b: Booking): boolean {
  const now = startOfDay(new Date()).getTime();
  const from = b.from.toMillis();
  const to = b.to ? endOfDay(b.to.toDate()).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now <= to;
}

function isBookingPast(b: Booking): boolean {
  if (!b.to) return false;
  return endOfDay(b.to.toDate()).getTime() < startOfDay(new Date()).getTime();
}

export default function CalendarGrid({
  days,
  fleet,
  bookings,
  events,
  defects,
  locations,
  viewMode,
  readOnly,
  onSelectBooking,
  onCreateForCell,
}: Props) {
  const dayCount = days.length;

  // Pre-group bookings by tail so we don't re-filter on every cell.
  const bookingsByTail = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const arr = m.get(b.tailNumber) ?? [];
      arr.push(b);
      m.set(b.tailNumber, arr);
    }
    return m;
  }, [bookings]);

  const eventsById = useMemo(() => {
    const m = new Map<string, MaintenanceEvent>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  const defectsById = useMemo(() => {
    const m = new Map<string, Defect>();
    for (const d of defects) m.set(d.id, d);
    return m;
  }, [defects]);

  const locationsById = useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  const todayIdx = useMemo(() => {
    return days.findIndex((d) => isToday(d));
  }, [days]);

  if (fleet.length === 0) {
    return (
      <div className="border border-dashed border-foreground/25 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No aircraft in the fleet yet.
        </p>
      </div>
    );
  }

  const gridTemplate = `${TAIL_COL_PX}px repeat(${dayCount}, minmax(0, 1fr))`;

  return (
    <div className="border border-foreground/20 bg-card overflow-hidden">
      {/* Header row */}
      <div
        className="grid border-b border-foreground/15 bg-foreground/[0.04]"
        style={{ gridTemplateColumns: gridTemplate, height: HEADER_HEIGHT_PX }}
      >
        <div className="border-r border-foreground/15 px-2 py-1 text-[10px] font-bold uppercase tracking-spec text-muted-foreground flex items-end">
          Tail
        </div>
        {days.map((d, i) => {
          const today = i === todayIdx;
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const isMonday = d.getDay() === 1;
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "border-r last:border-r-0 border-foreground/10 px-1 py-1 text-center flex flex-col justify-end",
                weekend && "bg-foreground/[0.03]",
                today && "bg-accent/25",
              )}
            >
              {today ? (
                <span className="text-[8px] font-bold uppercase tracking-spec text-accent-foreground">
                  Today
                </span>
              ) : isMonday ? (
                <span className="text-[8px] font-bold uppercase tracking-spec text-muted-foreground">
                  W{getISOWeek(d)}
                </span>
              ) : null}
              <div className="flex items-baseline justify-center gap-1 leading-none">
                <span className="text-[9px] uppercase tracking-spec text-muted-foreground">
                  {viewMode === "week" ? format(d, "EEE") : format(d, "EEEEE")}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    today ? "font-bold text-foreground" : "font-semibold",
                  )}
                >
                  {format(d, "d")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tail rows */}
      {fleet.map((a, rowIdx) => {
        const tailBookings = bookingsByTail.get(a.tailNumber) ?? [];
        const status = getAircraftStatus(a);
        const grounded = status === "grounded";
        const outOfProduction = status === "out-of-production";
        const offline = grounded || outOfProduction;
        return (
          <div
            key={a.tailNumber}
            className={cn(
              "relative grid border-b last:border-b-0 border-foreground/10",
              grounded
                ? "bg-sev-red-bg/30"
                : outOfProduction
                  ? "bg-foreground/[0.05]"
                  : rowIdx % 2 === 1 && "bg-foreground/[0.02]",
            )}
            style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT_PX }}
          >
            <div
              className={cn(
                "border-r border-foreground/15 px-2 flex flex-col justify-center font-mono text-xs font-bold tabular-nums tracking-stamp",
                grounded && "text-sev-red-fg",
                outOfProduction && "text-muted-foreground",
              )}
            >
              <span className="truncate leading-tight">{a.tailNumber}</span>
              {grounded && (
                <span className="text-[8px] font-bold uppercase tracking-spec text-sev-red-fg/80 leading-none">
                  Grounded
                </span>
              )}
              {outOfProduction && (
                <span className="text-[8px] font-bold uppercase tracking-spec text-muted-foreground leading-none">
                  Out of prod
                </span>
              )}
            </div>
            {days.map((d, i) => {
              const today = i === todayIdx;
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onCreateForCell(a.tailNumber, d)}
                  className={cn(
                    "border-r last:border-r-0 border-foreground/[0.07] transition-colors",
                    !readOnly &&
                      (grounded
                        ? "hover:bg-sev-red-bg/50"
                        : outOfProduction
                          ? "hover:bg-foreground/[0.09]"
                          : "hover:bg-accent/15"),
                    weekend &&
                      (grounded
                        ? "bg-sev-red-bg/40"
                        : outOfProduction
                          ? "bg-foreground/[0.07]"
                          : "bg-foreground/[0.03]"),
                    today && !offline && "bg-accent/10",
                    readOnly && "cursor-default",
                  )}
                  aria-label={`Book ${a.tailNumber} on ${format(d, "PP")}`}
                />
              );
            })}

            {/* Booking blocks layered above the day cells */}
            {tailBookings.map((b) => {
              const cols = bookingColumns(b, days);
              if (!cols) return null;
              const startCol = cols.startCol;
              const endCol = cols.endCol;
              const span = endCol - startCol + 1;

              const active = isBookingActiveOnNow(b);
              const past = isBookingPast(b);

              const left = `calc(${TAIL_COL_PX}px + (100% - ${TAIL_COL_PX}px) * ${startCol} / ${dayCount})`;
              const width = `calc((100% - ${TAIL_COL_PX}px) * ${span} / ${dayCount})`;

              const linkedEvents = (b.eventIds ?? [])
                .map((id) => eventsById.get(id))
                .filter((e): e is MaintenanceEvent => !!e);
              const linkedDefects = (b.defectIds ?? [])
                .map((id) => defectsById.get(id))
                .filter((d): d is Defect => !!d);
              const linkedLocation = b.locationId
                ? locationsById.get(b.locationId) ?? null
                : null;
              const groups = buildBookingGroups(linkedEvents, linkedDefects, b);
              const notes = b.notes?.trim() || null;
              const description = describeBookingGroups(groups);

              const titleAttr = [
                a.tailNumber,
                linkedLocation
                  ? `at ${linkedLocation.name}${linkedLocation.kind === "external" ? " (external)" : ""}`
                  : null,
                description,
                notes,
              ]
                .filter(Boolean)
                .join(" · ");

              const woBadgeClass = active
                ? "bg-background/20 text-background"
                : past
                  ? "bg-foreground/[0.08] text-muted-foreground"
                  : "bg-foreground/10 text-foreground";

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBooking(b);
                  }}
                  title={titleAttr}
                  className={cn(
                    "absolute top-1 bottom-1 border text-left px-1.5 flex items-center gap-1 overflow-hidden text-[11px] font-medium transition-colors",
                    "focus:outline-none focus:ring-1 focus:ring-accent focus:ring-offset-0",
                    active
                      ? "border-foreground bg-foreground text-background hover:bg-foreground/85"
                      : past
                        ? "border-foreground/20 bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.08]"
                        : "border-foreground/40 bg-card text-foreground hover:bg-foreground/[0.06]",
                    cols.clippedLeft && "border-l-0",
                  )}
                  style={{
                    left,
                    width,
                    ...(cols.openEnded
                      ? {
                          maskImage:
                            "linear-gradient(to right, black 0%, black 70%, transparent 100%)",
                          WebkitMaskImage:
                            "linear-gradient(to right, black 0%, black 70%, transparent 100%)",
                        }
                      : null),
                  }}
                >
                  {linkedLocation && (
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-spec",
                        active
                          ? "bg-background/20 text-background"
                          : past
                            ? "bg-foreground/[0.08] text-muted-foreground"
                            : "bg-foreground/10 text-foreground",
                      )}
                      title={`Location: ${linkedLocation.name}`}
                    >
                      {linkedLocation.kind === "external" ? (
                        <MapPin className="h-2.5 w-2.5" />
                      ) : (
                        <Building2 className="h-2.5 w-2.5" />
                      )}
                      {linkedLocation.name}
                    </span>
                  )}
                  {groups.length === 0 ? (
                    <span className="truncate">
                      {notes ?? "Booking"}
                    </span>
                  ) : (
                    groups.map((g, gi) => (
                      <Fragment key={gi}>
                        {gi > 0 && (
                          <span className="shrink-0 opacity-50">|</span>
                        )}
                        {g.wo && (
                          <span
                            className={cn(
                              "shrink-0 px-1 py-0.5 text-[10px] font-mono font-bold tracking-stamp",
                              woBadgeClass,
                            )}
                          >
                            WO {g.wo}
                          </span>
                        )}
                        <span className="truncate shrink min-w-0">
                          {g.items.map((it, ii) => (
                            <span
                              key={ii}
                              className={cn(
                                it.resolved && "line-through opacity-60",
                              )}
                            >
                              {ii > 0 ? " · " : ""}
                              {it.resolved && (
                                <Check className="inline h-2.5 w-2.5 mr-0.5" />
                              )}
                              {it.label}
                            </span>
                          ))}
                        </span>
                      </Fragment>
                    ))
                  )}
                  {notes && groups.length > 0 && (
                    <span className="truncate italic opacity-80">
                      · {notes}
                    </span>
                  )}
                  {notes && (
                    <StickyNote
                      className={cn(
                        "h-3 w-3 shrink-0 ml-auto",
                        active ? "text-background/70" : "text-muted-foreground",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
