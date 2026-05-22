import { useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
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

// One booking + the events/defects it links to. Resolved in the parent
// (OverviewPage) so this card doesn't need the global event/defect lists.
export type BookingWithLinks = {
  booking: Booking;
  events: MaintenanceEvent[];
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
  onOpenLinkedDefect?: (defect: Defect) => void;
  onOpenLinkedEvent?: (event: MaintenanceEvent) => void;
};

// Left stripe color — communicates the aircraft's worst severity at a glance.
// Severity wash on the whole card is intentionally dropped so the surface
// stays paper-white — severity is data (stripe + dot + cell tint), not
// atmosphere.
const stripe: Record<Severity, string> = {
  red: "border-l-sev-red-edge",
  yellow: "border-l-sev-yellow-edge",
  green: "border-l-sev-green-edge",
  unknown: "border-l-foreground/25",
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

  const activeBooking = bookings[0]?.booking ?? null;
  const inHangar = isBookingActive(activeBooking);
  const activeWo = inHangar
    ? buildBookingGroups(
        bookings[0]?.events ?? [],
        bookings[0]?.defects ?? [],
        bookings[0]?.booking ?? null,
      )[0]?.wo ?? null
    : null;

  const onToggleAirworthy = async () => {
    if (airworthy) {
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

  const linkedDefect =
    aircraft.groundingCauseType === "defect" && aircraft.groundingCauseId
      ? defects.find((d) => d.id === aircraft.groundingCauseId) ?? null
      : null;
  const linkedEvent =
    aircraft.groundingCauseType === "event" && aircraft.groundingCauseId
      ? events.find((e) => e.id === aircraft.groundingCauseId) ?? null
      : null;

  const stripeClass = airworthy
    ? stripe[worstSeverity]
    : "border-l-destructive";

  return (
    <section
      ref={cardRef}
      className={cn(
        "border border-foreground/20 border-l-4 bg-card overflow-hidden",
        stripeClass,
      )}
    >
      {/* ─── MASTHEAD ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[160px_minmax(0,1fr)]">
        {/* Tail-stamp left rail — full masthead height, anchors the card */}
        <div className="tail-stamp relative flex flex-col">
          <div className="border-b border-background/15 px-3 pt-2 pb-1">
            <span className="text-[8px] font-semibold uppercase tracking-spec text-background/70">
              Registration
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center px-3 py-2">
            <span className="font-mono text-[26px] font-bold tracking-stamp leading-none">
              {aircraft.tailNumber}
            </span>
          </div>
          {defects.length > 0 && (
            <div className="border-t border-background/15 px-3 py-1 text-[9px] font-semibold uppercase tracking-spec text-background/85 flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3" />
              {defects.length} defect{defects.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {/* Right region — identity, status, actions, TTAF, bookings */}
        <div className="flex flex-col">
          {/* Identity row */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-4 pt-2 pb-2 border-b border-foreground/10">
            <div className="min-w-0 space-y-1">
              <h3 className="font-display text-lg font-semibold leading-tight tracking-tight text-foreground truncate">
                {aircraft.model}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                {readOnly ? (
                  <AirworthyChip airworthy={airworthy} />
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
                    className="disabled:opacity-50"
                  >
                    <AirworthyChip airworthy={airworthy} />
                  </button>
                )}
                {inHangar && (
                  <span
                    className="inline-flex items-center gap-1 bg-accent text-accent-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-spec"
                    title="Aircraft is currently in the maintenance hangar"
                  >
                    <Wrench className="h-3 w-3" />
                    In maintenance
                    {activeWo && (
                      <span className="ml-0.5 bg-foreground/15 px-1 py-0.5 font-mono text-[9px] normal-case tracking-stamp">
                        WO {activeWo}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {aircraft.updatedAt && (
                <span
                  className="font-mono text-[9px] uppercase tracking-spec text-muted-foreground tabular-nums whitespace-nowrap"
                  title="Last update to any data on this aircraft"
                >
                  Last upd · {formatDate(aircraft.updatedAt)}
                </span>
              )}
              <ActionToolbar
                readOnly={readOnly}
                noteExists={!!aircraft.note}
                onAddEvent={onAddEvent}
                onAddDefect={onAddDefect}
                onEditNote={onEditNote}
                onOpenEditLog={onOpenEditLog}
                onPrint={onPrint}
              />
            </div>
          </div>

          {/* TTAF instrument strip */}
          <div className="flex items-stretch border-b border-foreground/10">
            <StripLabel icon={Gauge}>TTAF</StripLabel>
            <div className="flex flex-1 items-baseline gap-3 px-3 py-1.5 min-w-0">
              <span className="readout text-xl font-bold leading-none text-foreground">
                {formatMinutesAsDuration(aircraft.totalTimeMinutes)}
              </span>
              {aircraft.totalTimeUpdatedAt && (
                <span
                  className="ml-auto flex items-baseline gap-1.5 text-[10px] uppercase tracking-spec text-muted-foreground whitespace-nowrap"
                  title="Last TTAF update"
                >
                  <span>Updated</span>
                  <span className="font-mono normal-case tabular-nums text-foreground/80">
                    {formatDate(aircraft.totalTimeUpdatedAt)}
                  </span>
                </span>
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={onUpdateTtaf}
                title="Update TTAF"
                className="inline-flex items-center gap-1.5 border-l border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-spec text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Update
              </button>
            )}
          </div>

          {/* Bookings instrument strip */}
          <div className="flex items-stretch">
            <StripLabel icon={CalendarDays}>Bookings</StripLabel>
            <div className="flex flex-1 items-center gap-1.5 px-3 py-1.5 min-w-0 overflow-x-auto">
              {bookings.length === 0 ? (
                <span className="text-[11px] italic text-muted-foreground shrink-0">
                  none scheduled
                </span>
              ) : (
                bookings.map((entry) => (
                  <BookingChip
                    key={entry.booking.id}
                    entry={entry}
                    locationsById={locationsById}
                    onClick={() => onViewBooking(entry.booking)}
                  />
                ))
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={onAddBooking}
                title="Add booking for this tail"
                className="inline-flex items-center gap-1.5 border-l border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-spec text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── ALERTS (conditional) ────────────────────────────────────────── */}
      {!airworthy && aircraft.groundingCauseType && (
        <GroundingBanner
          causeType={aircraft.groundingCauseType}
          reason={aircraft.groundingReason ?? null}
          linkedDefect={linkedDefect}
          linkedEvent={linkedEvent}
          onOpenLinkedDefect={onOpenLinkedDefect}
          onOpenLinkedEvent={onOpenLinkedEvent}
        />
      )}
      {aircraft.note && (
        <NoteBanner
          note={aircraft.note}
          readOnly={readOnly}
          onEdit={onEditNote}
        />
      )}

      {/* ─── LEDGER ──────────────────────────────────────────────────────── */}
      <div className="border-t border-foreground/15 bg-card">
        {/* Events section */}
        <SectionBreak label={`Events · ${events.length} ${events.length === 1 ? "active" : "active"}`} />
        {events.length === 0 ? (
          <p className="px-3 py-2 text-xs italic text-muted-foreground">
            No events. Import flight data or add one manually.
          </p>
        ) : (
          <>
            <EventsColumnHeader readOnly={readOnly} />
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
          </>
        )}

        {/* Defects section — DefectsList renders its own section break */}
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
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function AirworthyChip({ airworthy }: { airworthy: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-spec transition-colors",
        airworthy
          ? "border-sev-green-edge/60 bg-sev-green-bg text-sev-green-fg hover:bg-sev-green-bg/80"
          : "border-sev-red-edge/60 bg-sev-red-bg text-sev-red-fg hover:bg-sev-red-bg/80",
      )}
      title={airworthy ? "Aircraft is airworthy" : "Aircraft is grounded"}
    >
      {airworthy ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <ShieldOff className="h-3.5 w-3.5" />
      )}
      {airworthy ? "Airworthy" : "Grounded"}
    </span>
  );
}

function StripLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex w-[160px] items-center gap-1.5 border-r border-foreground/15 bg-foreground/[0.05] px-4 py-1.5 text-[10px] font-bold uppercase tracking-spec text-foreground/85 shrink-0 whitespace-nowrap">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function ActionToolbar({
  readOnly,
  noteExists,
  onAddEvent,
  onAddDefect,
  onEditNote,
  onOpenEditLog,
  onPrint,
}: {
  readOnly: boolean;
  noteExists: boolean;
  onAddEvent: () => void;
  onAddDefect: () => void;
  onEditNote: () => void;
  onOpenEditLog: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="inline-flex items-stretch border border-foreground/25 divide-x divide-foreground/15 bg-card">
      {!readOnly && (
        <>
          <ActionBtn icon={Plus} label="Event" onClick={onAddEvent} />
          <ActionBtn icon={Plus} label="Defect" onClick={onAddDefect} />
          {!noteExists && (
            <ActionBtn icon={StickyNote} label="Note" onClick={onEditNote} />
          )}
        </>
      )}
      <ActionBtn icon={History} label="History" onClick={onOpenEditLog} />
      <ActionBtn icon={Printer} label="Print" onClick={onPrint} />
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-spec text-foreground/70 transition-colors hover:bg-foreground hover:text-background"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function BookingChip({
  entry,
  locationsById,
  onClick,
}: {
  entry: BookingWithLinks;
  locationsById: ReadonlyMap<string, Location>;
  onClick: () => void;
}) {
  const b = entry.booking;
  const active = isBookingActive(b);
  const groups = buildBookingGroups(entry.events, entry.defects, b);
  const wos = groups.map((g) => g.wo).filter((w): w is string => !!w);
  const primaryWo = wos[0] ?? null;
  const extraWoCount = Math.max(0, wos.length - 1);
  const hasEvent = entry.events.length > 0;
  const hasDefect = entry.defects.length > 0;
  const typeLabel =
    hasEvent && hasDefect
      ? "EVT+DEF"
      : hasEvent
        ? "EVT"
        : hasDefect
          ? "DEF"
          : null;

  const range = formatBookingRange(b.from, b.to);
  const notes = b.notes?.trim() || null;
  const description = describeBookingGroups(groups);
  const location = b.locationId ? locationsById.get(b.locationId) ?? null : null;
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
      type="button"
      onClick={onClick}
      title={titleAttr || "View booking"}
      className={cn(
        "shrink-0 inline-flex items-stretch border text-[10px] transition-colors",
        active
          ? "border-foreground bg-foreground text-background hover:bg-foreground/85"
          : "border-foreground/40 bg-card text-foreground hover:bg-foreground/[0.06]",
      )}
    >
      <span className="px-1.5 py-0.5 font-mono tabular-nums">
        {formatDate(b.from)}
      </span>
      {typeLabel && (
        <span
          className={cn(
            "border-l px-1 py-0.5 text-[9px] font-bold uppercase tracking-spec flex items-center",
            active
              ? "border-background/30 bg-background/15"
              : "border-foreground/20 bg-foreground/[0.06]",
          )}
        >
          {typeLabel}
        </span>
      )}
      {primaryWo && (
        <span
          className={cn(
            "border-l px-1 py-0.5 font-mono font-bold flex items-center",
            active
              ? "border-background/30 bg-background/15"
              : "border-foreground/20 bg-foreground/[0.06]",
          )}
        >
          WO {primaryWo}
          {extraWoCount > 0 ? ` +${extraWoCount}` : ""}
        </span>
      )}
    </button>
  );
}

function SectionBreak({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-foreground/10 bg-card px-3 py-1.5">
      <span className="label-eyebrow-strong">{label}</span>
      <span className="section-rule" />
    </div>
  );
}

function EventsColumnHeader({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="border-b border-foreground/10 bg-foreground/[0.03]">
      {/* Top row: column-group labels spanning the compartment columns */}
      <div
        className={cn(
          "grid items-end px-3 pt-1 text-[9px] uppercase tracking-spec text-muted-foreground/70",
          EVENTS_GRID_COLS,
        )}
      >
        <span />
        <span />
        <span />
        <span />
        <span />
        <span className="border-l border-foreground/15 col-span-2 text-center py-0.5 font-semibold text-foreground/60">
          Due at
        </span>
        <span className="border-l border-foreground/15 col-span-2 text-center py-0.5 font-semibold text-foreground/60">
          Time left
        </span>
        <span />
      </div>
      {/* Bottom row: per-column subtitle */}
      <div
        className={cn(
          "grid items-end px-3 pb-1 text-[9px] font-semibold uppercase tracking-spec text-muted-foreground",
          EVENTS_GRID_COLS,
        )}
      >
        <span className="px-1">WO</span>
        <span className="px-1">REQ</span>
        <span className="pl-3.5">Event</span>
        <span>Status</span>
        <span>Estimate</span>
        <span className="border-l border-foreground/15 px-2 text-center">
          Date
        </span>
        <span className="border-l border-foreground/15 px-2 text-center">
          TTAF
        </span>
        <span className="border-l border-foreground/15 px-1 text-center">
          Days
        </span>
        <span className="border-l border-r border-foreground/15 px-1 text-center">
          Hours
        </span>
        <span className="text-right pl-2">{readOnly ? "" : "Actions"}</span>
      </div>
    </div>
  );
}

function GroundingBanner({
  causeType,
  reason,
  linkedDefect,
  linkedEvent,
  onOpenLinkedDefect,
  onOpenLinkedEvent,
}: {
  causeType: "defect" | "event" | "other";
  reason: string | null;
  linkedDefect: Defect | null;
  linkedEvent: MaintenanceEvent | null;
  onOpenLinkedDefect?: (d: Defect) => void;
  onOpenLinkedEvent?: (e: MaintenanceEvent) => void;
}) {
  let body: React.ReactNode = null;
  let onClick: (() => void) | undefined;
  let title = "Grounding cause";
  let interactive = false;

  if (causeType === "defect") {
    if (linkedDefect) {
      body = (
        <>
          <span className="font-medium">"{linkedDefect.title}"</span>
          {linkedDefect.workOrderNumber && (
            <span className="ml-1.5 font-mono text-[11px] opacity-80">
              WO {linkedDefect.workOrderNumber}
            </span>
          )}
        </>
      );
      if (onOpenLinkedDefect) {
        onClick = () => onOpenLinkedDefect(linkedDefect);
        title = "Open linked defect";
        interactive = true;
      }
    } else {
      body = (
        <span className="italic">
          Linked defect no longer exists — manually lift to clear.
        </span>
      );
    }
  } else if (causeType === "event") {
    if (linkedEvent) {
      const wo = linkedEvent.workOrderNumber?.trim();
      body = (
        <>
          {wo && (
            <span className="font-mono text-[11px] opacity-80 mr-1.5">
              WO {wo}
            </span>
          )}
          <span className="font-medium">"{linkedEvent.warning}"</span>
        </>
      );
      if (onOpenLinkedEvent) {
        onClick = () => onOpenLinkedEvent(linkedEvent);
        title = "Open linked event";
        interactive = true;
      }
    } else {
      body = (
        <span className="italic">
          Linked event no longer exists — manually lift to clear.
        </span>
      );
    }
  } else {
    body = (
      <span className="whitespace-pre-wrap break-words">
        {reason ?? "(no reason recorded)"}
      </span>
    );
  }

  const kicker =
    causeType === "defect"
      ? "Defect"
      : causeType === "event"
        ? "Event"
        : "Reason";

  const Wrap: keyof React.JSX.IntrinsicElements = interactive ? "button" : "div";
  return (
    <Wrap
      {...(interactive ? { type: "button", onClick, title } : {})}
      className={cn(
        "w-full flex items-stretch border-t border-foreground/10 bg-sev-red-bg text-sev-red-fg text-left",
        interactive && "transition-colors hover:bg-sev-red-bg/75 cursor-pointer",
      )}
    >
      <div className="flex flex-col items-center justify-center border-r border-sev-red-edge/30 px-2.5 py-1.5">
        <ShieldOff className="h-3.5 w-3.5 mb-0.5" />
        <span className="text-[8px] font-bold uppercase tracking-spec">
          Ground
        </span>
      </div>
      <div className="flex flex-1 items-center gap-2 px-3 py-1.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-spec shrink-0">
          {kicker}:
        </span>
        <span className="text-xs min-w-0 truncate">{body}</span>
      </div>
      {interactive && (
        <div className="flex items-center px-2 text-sev-red-fg/60">
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      )}
    </Wrap>
  );
}

function NoteBanner({
  note,
  readOnly,
  onEdit,
}: {
  note: string;
  readOnly: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-stretch border-t border-foreground/10 bg-sev-yellow-bg text-sev-yellow-fg">
      <div className="flex flex-col items-center justify-center border-r border-sev-yellow-edge/30 px-2.5 py-1.5">
        <StickyNote className="h-3.5 w-3.5 mb-0.5" />
        <span className="text-[8px] font-bold uppercase tracking-spec">
          Note
        </span>
      </div>
      <span className="flex-1 px-3 py-1.5 whitespace-pre-wrap break-words text-xs">
        {note}
      </span>
      {!readOnly && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit note"
          className="px-2 text-sev-yellow-fg/70 transition-colors hover:bg-sev-yellow-bg/70 hover:text-sev-yellow-fg"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
