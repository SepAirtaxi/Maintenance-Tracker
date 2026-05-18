import { useRef, useState } from "react";
import {
  CalendarDays,
  Gauge,
  History,
  Pencil,
  Plus,
  Printer,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  StickyNote,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBookingRange, formatDate } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import { type Severity } from "@/lib/eventStatus";
import { liftGrounding } from "@/services/aircraft";
import { isBookingActive } from "@/services/bookings";
import {
  buildBookingGroups,
  describeBookingGroups,
} from "@/lib/bookingDisplay";
import EventRow, { EVENTS_GRID_COLS } from "@/components/overview/EventRow";
import DefectsList from "@/components/overview/DefectsList";
import type {
  Aircraft,
  Booking,
  Defect,
  Location,
  MaintenanceEvent,
} from "@/types";

// One booking + the event/defects it links to. Resolved in the parent
// (OverviewPage) so this card doesn't need the global event/defect lists.
export type BookingWithLinks = {
  booking: Booking;
  event: MaintenanceEvent | null;
  defects: Defect[];
};

type Props = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  // All active + upcoming bookings for this tail, active-first then by `from`.
  bookings: BookingWithLinks[];
  worstSeverity: Severity;
  airworthy: boolean;
  bookedEventIds: ReadonlySet<string>;
  bookedDefectIds: ReadonlySet<string>;
  locationsById: ReadonlyMap<string, Location>;
  readOnly?: boolean;
  onOpenEditLog: () => void;
  onUpdateTtaf: () => void;
  onAddBooking: () => void;
  onViewBooking: (booking: Booking) => void;
  // Open the grounding dialog (cause picker). Called when toggling
  // airworthy → grounded; un-grounding is handled inline here via
  // liftGrounding because it carries no extra data.
  onGround: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: MaintenanceEvent) => void;
  onDeleteEvent: (event: MaintenanceEvent) => void;
  onResolveEvent: (event: MaintenanceEvent) => void;
  onExtendEvent: (event: MaintenanceEvent) => void;
  onEstimateEvent: (event: MaintenanceEvent) => void;
  onAddDefect: () => void;
  onEditDefect: (defect: Defect) => void;
  onDeleteDefect: (defect: Defect) => void;
  onResolveDefect: (defect: Defect) => void;
  onDeferDefect: (defect: Defect) => void;
  onViewDeferralHistory: (defect: Defect) => void;
  onEstimateDefect: (defect: Defect) => void;
  onEditNote: () => void;
  // Jump to the defect/event card section for a click-through on the
  // grounding-cause banner. The cause lives on the same tail by construction.
  onOpenLinkedDefect?: (defect: Defect) => void;
  onOpenLinkedEvent?: (event: MaintenanceEvent) => void;
};

const stripe: Record<Severity, string> = {
  red: "border-l-status-red bg-rose-50",
  yellow: "border-l-status-yellow bg-amber-50",
  green: "border-l-status-green bg-emerald-50/70",
  unknown: "border-l-muted-foreground/30 bg-card",
};

const headerBg: Record<Severity, string> = {
  red: "bg-rose-100",
  yellow: "bg-amber-100",
  green: "bg-emerald-100/70",
  unknown: "bg-secondary",
};

export default function AircraftCard({
  aircraft,
  events,
  defects,
  bookings,
  worstSeverity,
  airworthy,
  bookedEventIds,
  bookedDefectIds,
  locationsById,
  readOnly = false,
  onOpenEditLog,
  onUpdateTtaf,
  onAddBooking,
  onViewBooking,
  onGround,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onResolveEvent,
  onExtendEvent,
  onEstimateEvent,
  onAddDefect,
  onEditDefect,
  onDeleteDefect,
  onResolveDefect,
  onDeferDefect,
  onViewDeferralHistory,
  onEstimateDefect,
  onEditNote,
  onOpenLinkedDefect,
  onOpenLinkedEvent,
}: Props) {
  const [togglingAirworthy, setTogglingAirworthy] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  const onPrint = () => {
    const card = cardRef.current;
    if (!card) return;
    card.classList.add("print-target");
    document.body.classList.add("printing-card");
    const cleanup = () => {
      card.classList.remove("print-target");
      document.body.classList.remove("printing-card");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };
  // The first entry is the currently-active booking when one exists (sorted
  // active-first upstream), so the "In maintenance" header pill mirrors that.
  const activeBooking = bookings[0]?.booking ?? null;
  const inHangar = isBookingActive(activeBooking);
  const activeWo = inHangar
    ? buildBookingGroups(
        bookings[0]?.event ?? null,
        bookings[0]?.defects ?? [],
      )[0]?.wo ?? null
    : null;

  const onToggleAirworthy = async () => {
    if (airworthy) {
      // Grounding requires a cause — defer to the parent's dialog.
      onGround();
      return;
    }
    setTogglingAirworthy(true);
    try {
      await liftGrounding(aircraft.tailNumber, { kind: "manual" });
    } finally {
      setTogglingAirworthy(false);
    }
  };

  // Resolve the linked defect/event on this tail so the grounding-cause
  // banner can render a meaningful label and click-through. Missing refs
  // (e.g. the linked item was deleted before lifting) fall back to the
  // stored reason; "other" groundings carry their own free text.
  const linkedDefect =
    aircraft.groundingCauseType === "defect" && aircraft.groundingCauseId
      ? defects.find((d) => d.id === aircraft.groundingCauseId) ?? null
      : null;
  const linkedEvent =
    aircraft.groundingCauseType === "event" && aircraft.groundingCauseId
      ? events.find((e) => e.id === aircraft.groundingCauseId) ?? null
      : null;

  // TTAF delta — only render when we know the prior value and it's lower
  // than the current one. Negative deltas (a correction) are hidden so the
  // pill doesn't read "Last flight: -2:00".
  const ttafDeltaMinutes =
    aircraft.totalTimeMinutes != null &&
    aircraft.previousTotalTimeMinutes != null &&
    aircraft.totalTimeMinutes > aircraft.previousTotalTimeMinutes
      ? aircraft.totalTimeMinutes - aircraft.previousTotalTimeMinutes
      : null;

  const containerClass = airworthy
    ? cn("border-l-4", stripe[worstSeverity])
    : "border-l-4 border-l-destructive bg-muted";
  const headerClass = airworthy ? headerBg[worstSeverity] : "bg-muted/80";

  return (
    <section
      ref={cardRef}
      className={cn(
        "rounded-md border shadow-md overflow-hidden",
        containerClass,
      )}
    >
      <header className={cn("border-b", headerClass)}>
        {/* Row 1: identity, status, actions */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-1.5">
          <span className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-2.5 py-1 font-mono text-base font-bold tracking-wide shadow-sm">
            {aircraft.tailNumber}
          </span>
          <span className="text-xs text-muted-foreground">
            {aircraft.model}
          </span>

          {readOnly ? (
            <span
              title={airworthy ? "Aircraft is airworthy" : "Aircraft is grounded"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm",
                airworthy
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-rose-300 bg-rose-100 text-rose-800",
              )}
            >
              {airworthy ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {airworthy ? "Airworthy" : "Grounded"}
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleAirworthy}
              disabled={togglingAirworthy}
              title={
                airworthy
                  ? "Click to mark as grounded"
                  : "Click to mark as airworthy"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm transition-colors disabled:opacity-50",
                airworthy
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  : "border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200",
              )}
            >
              {airworthy ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              {airworthy ? "Airworthy" : "Grounded"}
            </button>
          )}

          {inHangar && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm"
              title="Aircraft is currently in the maintenance hangar"
            >
              <Wrench className="h-3.5 w-3.5" />
              In maintenance
              {activeWo && (
                <span className="ml-1 rounded bg-white/20 px-1 py-0.5 text-[10px] font-mono normal-case tracking-normal">
                  WO: {activeWo}
                </span>
              )}
            </span>
          )}

          {defects.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 text-amber-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              <ShieldAlert className="h-3 w-3" />
              {defects.length} defect{defects.length === 1 ? "" : "s"}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {aircraft.updatedAt && (
              <span
                className="text-[10px] text-muted-foreground whitespace-nowrap"
                title="Last update to any data on this aircraft"
              >
                Last updated: {formatDate(aircraft.updatedAt)}
              </span>
            )}
            <div className="flex items-center gap-0.5">
              {!readOnly && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={onAddEvent}
                    title="Add event"
                  >
                    <Plus className="h-3 w-3" />
                    Event
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={onAddDefect}
                    title="Report defect"
                  >
                    <Plus className="h-3 w-3" />
                    Defect
                  </Button>
                  {!aircraft.note && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={onEditNote}
                      title="Add note"
                    >
                      <StickyNote className="h-3 w-3" />
                      Note
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onOpenEditLog}
                title="Show history"
              >
                <History className="h-3 w-3" />
                History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onPrint}
                title="Print this aircraft card"
              >
                <Printer className="h-3 w-3" />
                Print
              </Button>
            </div>
          </div>
        </div>

        {/* Row 2: TTAF (content-width) + Booked (fills remaining space). The
            booking cell takes most of the row so multiple stacked bookings
            have room to breathe; the event/defect titles live in the tables
            below, so the booking rows only need date + location + WO chips. */}
        <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-2 px-3 pb-1.5">
          <div className="grid grid-cols-[14px_3rem_auto_auto_auto_22px] items-center gap-x-2 rounded-md border bg-background px-2 py-1 shadow-sm">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              TTAF
            </span>
            <span className="font-mono font-semibold tabular-nums text-sm">
              {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
            </span>
            {ttafDeltaMinutes != null ? (
              <span
                className="text-[10px] text-muted-foreground whitespace-nowrap"
                title="Increase since the previous TTAF reading on this aircraft"
              >
                Last flight:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatMinutesAsDuration(ttafDeltaMinutes)}
                </span>
              </span>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-muted-foreground whitespace-nowrap justify-self-end">
              {aircraft.totalTimeUpdatedAt
                ? `Last updated: ${formatDate(aircraft.totalTimeUpdatedAt)}${
                    aircraft.totalTimeSource
                      ? ` · ${aircraft.totalTimeSource}`
                      : ""
                  }`
                : ""}
            </span>
            {readOnly ? (
              <span className="justify-self-end" />
            ) : (
              <button
                type="button"
                onClick={onUpdateTtaf}
                title="Update TTAF manually"
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground justify-self-end"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Bookings cell — single-line height regardless of how many bookings
              the tail has. Compact pills (start date · type · WO) scroll
              horizontally if they overflow, so the card header stays a
              stable height. Full details (range, location, notes, item
              titles) live on click in BookingViewDialog and in tooltips. */}
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 shadow-sm overflow-hidden">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
              Bookings
            </span>
            {bookings.length === 0 ? (
              <span className="text-xs italic text-muted-foreground shrink-0">
                none scheduled
              </span>
            ) : (
              <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
                {bookings.map((entry) => {
                  const b = entry.booking;
                  const active = isBookingActive(b);
                  const groups = buildBookingGroups(
                    entry.event,
                    entry.defects,
                  );
                  const wos = groups
                    .map((g) => g.wo)
                    .filter((w): w is string => !!w);
                  const primaryWo = wos[0] ?? null;
                  const extraWoCount = Math.max(0, wos.length - 1);
                  const hasEvent = !!entry.event;
                  const hasDefect = entry.defects.length > 0;
                  const typeLabel =
                    hasEvent && hasDefect
                      ? "Event+Defect"
                      : hasEvent
                        ? "Event"
                        : hasDefect
                          ? "Defect"
                          : null;

                  const range = formatBookingRange(b.from, b.to);
                  const notes = b.notes?.trim() || null;
                  const description = describeBookingGroups(groups);
                  const location = b.locationId
                    ? locationsById.get(b.locationId) ?? null
                    : null;
                  const titleAttr = [
                    active ? `In hangar ${range}` : `Booked ${range}`,
                    location ? `at ${location.name}` : null,
                    description,
                    notes,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onViewBooking(b)}
                      title={titleAttr || "View booking"}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                        active
                          ? "border-blue-400 bg-blue-100 hover:bg-blue-200 text-blue-950"
                          : "border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900",
                      )}
                    >
                      <span className="font-mono tabular-nums">
                        {formatDate(b.from)}
                      </span>
                      {typeLabel && (
                        <span
                          className={cn(
                            "rounded px-1 text-[9px] font-semibold uppercase tracking-wider",
                            active
                              ? "bg-blue-200 text-blue-900"
                              : "bg-sky-200 text-sky-900",
                          )}
                        >
                          {typeLabel}
                        </span>
                      )}
                      {primaryWo && (
                        <span
                          className={cn(
                            "rounded px-1 font-mono font-semibold",
                            active
                              ? "bg-blue-300 text-blue-950"
                              : "bg-sky-300 text-sky-950",
                          )}
                        >
                          WO: {primaryWo}
                          {extraWoCount > 0 ? ` +${extraWoCount}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={onAddBooking}
                title="Add booking for this tail"
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {!airworthy && aircraft.groundingCauseType && (
          <div className="px-3 pb-2">
            {(() => {
              // Three render paths share the same banner shell. Linked
              // defect/event variants are click-through (open the related
              // dialog); "other" is plain text. We resolve the live linked
              // item up at the top of the component so the title here
              // tracks edits made after grounding.
              const causeType = aircraft.groundingCauseType;
              let label: React.ReactNode = null;
              let onClick: (() => void) | undefined;
              let title = "Grounding cause";

              if (causeType === "defect") {
                if (linkedDefect) {
                  label = (
                    <>
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Grounded — Defect:
                      </span>{" "}
                      <span className="font-medium">"{linkedDefect.title}"</span>
                      {linkedDefect.workOrderNumber && (
                        <span className="ml-1 font-mono text-[11px]">
                          (WO {linkedDefect.workOrderNumber})
                        </span>
                      )}
                    </>
                  );
                  if (onOpenLinkedDefect) {
                    onClick = () => onOpenLinkedDefect(linkedDefect);
                    title = "Open linked defect";
                  }
                } else {
                  label = (
                    <span className="italic">
                      Grounded — linked defect no longer exists. Manually
                      lift to clear the cause.
                    </span>
                  );
                }
              } else if (causeType === "event") {
                if (linkedEvent) {
                  const wo = linkedEvent.workOrderNumber?.trim();
                  label = (
                    <>
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Grounded — {wo ? `WO ${wo}:` : "Event:"}
                      </span>{" "}
                      <span className="font-medium">"{linkedEvent.warning}"</span>
                    </>
                  );
                  if (onOpenLinkedEvent) {
                    onClick = () => onOpenLinkedEvent(linkedEvent);
                    title = "Open linked event";
                  }
                } else {
                  label = (
                    <span className="italic">
                      Grounded — linked event no longer exists. Manually
                      lift to clear the cause.
                    </span>
                  );
                }
              } else {
                label = (
                  <>
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Grounded —
                    </span>{" "}
                    <span className="whitespace-pre-wrap break-words">
                      {aircraft.groundingReason ?? "(no reason recorded)"}
                    </span>
                  </>
                );
              }

              const interactive = !!onClick;
              const Wrap: keyof React.JSX.IntrinsicElements = interactive
                ? "button"
                : "div";
              return (
                <Wrap
                  {...(interactive
                    ? { type: "button", onClick, title }
                    : {})}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 shadow-sm text-left",
                    interactive &&
                      "transition-colors hover:bg-rose-100 cursor-pointer",
                  )}
                >
                  <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" />
                  <span className="flex-1 text-xs text-rose-900">
                    {label}
                  </span>
                </Wrap>
              );
            })()}
          </div>
        )}

        {aircraft.note && (
          <div className="px-3 pb-2">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 shadow-sm">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span className="flex-1 whitespace-pre-wrap break-words text-xs text-amber-900">
                {aircraft.note}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onEditNote}
                  title="Edit note"
                  className="rounded p-0.5 text-amber-800/70 hover:bg-amber-100 hover:text-amber-900"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {events.length === 0 ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground bg-card">
          No events. Import flight data or add one manually.
        </p>
      ) : (
        <div className="bg-card">
          {/* Header row — supergroup labels live inside the compartments */}
          <div
            className={cn(
              "grid items-end gap-2 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/40",
              EVENTS_GRID_COLS,
            )}
          >
            <span className="self-end pb-0.5 px-1">WO</span>
            <span className="self-end pb-0.5 px-1">REQ</span>
            <span className="self-end pb-0.5">Event</span>
            <span className="self-end pb-0.5">Status</span>
            <span className="self-end pb-0.5">Estimate</span>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/70 text-center text-[9px] font-bold tracking-wider py-0 border-b border-border text-foreground/80">
                Due at
              </div>
              <div className="grid grid-cols-2 divide-x divide-border text-[9px] text-center">
                <span className="py-0.5">Date</span>
                <span className="py-0.5">TTAF</span>
              </div>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-muted/70 text-center text-[9px] font-bold tracking-wider py-0 border-b border-border text-foreground/80">
                Time left
              </div>
              <div className="grid grid-cols-2 divide-x divide-border text-[9px] text-center">
                <span className="py-0.5">Days</span>
                <span className="py-0.5">Hours</span>
              </div>
            </div>
            <span className="self-end pb-0.5 text-right">
              {readOnly ? "" : "Actions"}
            </span>
          </div>
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              currentTtafMinutes={aircraft.totalTimeMinutes}
              booked={bookedEventIds.has(event.id)}
              readOnly={readOnly}
              onEdit={() => onEditEvent(event)}
              onDelete={() => onDeleteEvent(event)}
              onResolve={() => onResolveEvent(event)}
              onExtend={() => onExtendEvent(event)}
              onEstimate={() => onEstimateEvent(event)}
            />
          ))}
        </div>
      )}

      <DefectsList
        defects={defects}
        bookedDefectIds={bookedDefectIds}
        readOnly={readOnly}
        onEdit={onEditDefect}
        onDelete={onDeleteDefect}
        onResolve={onResolveDefect}
        onDefer={onDeferDefect}
        onViewDeferralHistory={onViewDeferralHistory}
        onEstimate={onEstimateDefect}
      />
    </section>
  );
}
