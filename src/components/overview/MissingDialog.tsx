import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Plus,
  RotateCcw,
  ShieldOff,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import {
  NEEDS_BOOKING_MINUTES_THRESHOLD,
  type MissingEventMatch,
  type NeedsBookingMatch,
} from "@/lib/eventStatus";

// Compact hours label for a booking-window value in minutes — "5h", "7.5h".
function windowHoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

type Tab = "bookings" | "events";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingMatches: NeedsBookingMatch[];
  eventMatches: MissingEventMatch[];
  readOnly: boolean;
  onBook: (tailNumber: string) => void;
  onAddEvent: (tailNumber: string) => void;
  // Sets (hours) or clears (null) the per-event booking-warning window.
  onSetThreshold: (eventId: string, hours: number | null) => Promise<void>;
};

export default function MissingDialog({
  open,
  onOpenChange,
  bookingMatches,
  eventMatches,
  readOnly,
  onBook,
  onAddEvent,
  onSetThreshold,
}: Props) {
  // Active count drives the tab badge and the default-tab pick; snoozed rows are
  // management-only and shouldn't tip either.
  const activeBookingCount = useMemo(
    () => bookingMatches.filter((m) => !m.snoozed).length,
    [bookingMatches],
  );

  // Default tab on open = whichever has more matches. Ties → Bookings, so the
  // existing muscle memory holds.
  const [tab, setTab] = useState<Tab>("bookings");
  useEffect(() => {
    if (!open) return;
    setTab(eventMatches.length > activeBookingCount ? "events" : "bookings");
  }, [open, activeBookingCount, eventMatches.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1100px)] w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle>Missing</DialogTitle>
          <DialogDescription>
            Aircraft with gaps — events that need a hangar slot, or aircraft
            missing a scheduled recurring inspection.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex items-stretch border border-foreground/25 divide-x divide-foreground/15 bg-card self-start">
          <TabButton
            active={tab === "bookings"}
            onClick={() => setTab("bookings")}
            icon={<CalendarPlus className="h-3.5 w-3.5" />}
            label="Bookings"
            count={activeBookingCount}
          />
          <TabButton
            active={tab === "events"}
            onClick={() => setTab("events")}
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label="Events"
            count={eventMatches.length}
          />
        </div>

        {tab === "bookings" ? (
          <BookingsTab
            matches={bookingMatches}
            readOnly={readOnly}
            onBook={(tail) => {
              onBook(tail);
              onOpenChange(false);
            }}
            onSetThreshold={onSetThreshold}
          />
        ) : (
          <EventsTab
            matches={eventMatches}
            readOnly={readOnly}
            onAdd={(tail) => {
              onAddEvent(tail);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-spec transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "inline-flex min-w-[1.25rem] items-center justify-center border px-1 py-0.5 font-mono text-[10px] tabular-nums",
          active
            ? "border-background/40 bg-background/15"
            : count > 0
              ? "border-sev-yellow-edge/60 bg-sev-yellow-bg text-sev-yellow-fg"
              : "border-foreground/20 bg-foreground/[0.04]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

const BOOKINGS_GRID_COLS = "84px minmax(0,1fr) 110px 96px 128px";

function sortByUrgency(matches: NeedsBookingMatch[]): NeedsBookingMatch[] {
  // Hours-matches sort by remaining minutes; date-matches by days-as-minutes so
  // the two share a comparable urgency axis, hours typically first (smaller
  // numbers = more urgent).
  return [...matches].sort((a, b) => {
    const ka = a.reason === "hours" ? a.remaining : a.remaining * 24 * 60;
    const kb = b.reason === "hours" ? b.remaining : b.remaining * 24 * 60;
    return ka - kb;
  });
}

function BookingsTab({
  matches,
  readOnly,
  onBook,
  onSetThreshold,
}: {
  matches: NeedsBookingMatch[];
  readOnly: boolean;
  onBook: (tail: string) => void;
  onSetThreshold: (eventId: string, hours: number | null) => Promise<void>;
}) {
  // Which row (if any) has its warning-window editor open.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { active, snoozed } = useMemo(() => {
    const a: NeedsBookingMatch[] = [];
    const s: NeedsBookingMatch[] = [];
    for (const m of matches) (m.snoozed ? s : a).push(m);
    return { active: sortByUrgency(a), snoozed: sortByUrgency(s) };
  }, [matches]);

  if (active.length === 0 && snoozed.length === 0) {
    return (
      <div className="border border-foreground/20 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing in the booking window right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <div className="border border-foreground/20 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No active booking warnings. Snoozed items with a custom window are
          listed below.
        </div>
      ) : (
        <div className="border border-foreground/20 bg-card overflow-hidden">
          <div
            className="grid items-center gap-2 px-3 py-1.5 border-b border-foreground/15 bg-foreground/[0.04] text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
            style={{ gridTemplateColumns: BOOKINGS_GRID_COLS }}
          >
            <span>Tail</span>
            <span>Event</span>
            <span className="justify-self-end">Due at</span>
            <span className="justify-self-center">Time left</span>
            <span />
          </div>
          <div className="divide-y divide-foreground/10">
            {active.map((r) => (
              <BookingRow
                key={r.event.id}
                row={r}
                tone="active"
                readOnly={readOnly}
                editing={editingId === r.event.id}
                onEdit={() => setEditingId(r.event.id)}
                onCloseEdit={() => setEditingId(null)}
                onBook={onBook}
                onSetThreshold={onSetThreshold}
              />
            ))}
          </div>
        </div>
      )}

      {snoozed.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
              Snoozed · custom window · {snoozed.length}
            </span>
            <span className="h-px flex-1 bg-foreground/15" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Held back by a lower per-event window — no active warning until they
            reach it. Adjust or reset any time.
          </p>
          <div className="border border-foreground/20 bg-card overflow-hidden">
            <div className="divide-y divide-foreground/10">
              {snoozed.map((r) => (
                <BookingRow
                  key={r.event.id}
                  row={r}
                  tone="snoozed"
                  readOnly={readOnly}
                  editing={editingId === r.event.id}
                  onEdit={() => setEditingId(r.event.id)}
                  onCloseEdit={() => setEditingId(null)}
                  onBook={onBook}
                  onSetThreshold={onSetThreshold}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingRow({
  row: r,
  tone,
  readOnly,
  editing,
  onEdit,
  onCloseEdit,
  onBook,
  onSetThreshold,
}: {
  row: NeedsBookingMatch;
  tone: "active" | "snoozed";
  readOnly: boolean;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onBook: (tail: string) => void;
  onSetThreshold: (eventId: string, hours: number | null) => Promise<void>;
}) {
  const isSnoozed = tone === "snoozed";
  const hasOverride = r.event.bookingWindowOverrideMinutes != null;
  const canAdjust = !readOnly && r.reason === "hours";

  const primary =
    r.reason === "hours"
      ? formatMinutesAsDuration(r.event.timerExpiryTimeMinutes)
      : formatDate(r.event.expiryDate);
  const metric =
    r.reason === "hours" ? `${formatHoursLeft(r.remaining)} hrs` : `${r.remaining}d`;

  return (
    <>
      <div
        className={cn(
          "grid items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/[0.025]",
          isSnoozed && "opacity-70",
        )}
        style={{ gridTemplateColumns: BOOKINGS_GRID_COLS }}
      >
        <span className="inline-flex items-center justify-center border border-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 font-mono font-bold tracking-stamp text-[11px]">
          {r.event.tailNumber}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate" title={r.event.warning}>
            {r.event.warning}
          </span>
          {hasOverride && (
            <span className="inline-flex shrink-0 items-center border border-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
              {isSnoozed ? "warns at " : "window "}
              {windowHoursLabel(r.event.bookingWindowOverrideMinutes!)}
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums text-[11px] text-muted-foreground justify-self-end">
          {primary}
        </span>
        <span
          className={cn(
            "inline-flex w-full items-center justify-center border px-1.5 py-0.5 font-mono text-xs tabular-nums whitespace-nowrap",
            isSnoozed
              ? "border-foreground/20 bg-foreground/[0.03] text-muted-foreground"
              : "bg-sev-yellow-bg text-sev-yellow-fg border-sev-yellow-edge/60",
          )}
        >
          {metric}
        </span>
        <div className="flex items-center justify-end gap-1">
          {canAdjust && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Adjust warning window"
              onClick={editing ? onCloseEdit : onEdit}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          )}
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onBook(r.event.tailNumber)}
            >
              Book
            </Button>
          )}
        </div>
      </div>
      {editing && canAdjust && (
        <ThresholdEditor
          eventId={r.event.id}
          currentMinutes={r.thresholdMinutes}
          hasOverride={hasOverride}
          onSetThreshold={onSetThreshold}
          onClose={onCloseEdit}
        />
      )}
    </>
  );
}

function ThresholdEditor({
  eventId,
  currentMinutes,
  hasOverride,
  onSetThreshold,
  onClose,
}: {
  eventId: string;
  currentMinutes: number | null;
  hasOverride: boolean;
  onSetThreshold: (eventId: string, hours: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() =>
    currentMinutes != null ? String(currentMinutes / 60) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (hours: number | null) => {
    setPending(true);
    setError(null);
    try {
      await onSetThreshold(eventId, hours);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setPending(false);
    }
  };

  const save = () => {
    const hours = Number(value);
    if (!value.trim() || !Number.isFinite(hours) || hours <= 0) {
      setError("Enter a positive number of hours.");
      return;
    }
    void submit(hours);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 bg-foreground/[0.03] text-xs">
      <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
        Warn when
      </span>
      <div className="inline-flex items-center gap-1.5">
        <Input
          type="number"
          min="0.5"
          step="0.5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          disabled={pending}
          className="h-7 w-20 font-mono text-xs"
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          hours left
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">
        fleet default {windowHoursLabel(NEEDS_BOOKING_MINUTES_THRESHOLD)}
      </span>
      <div className="ml-auto inline-flex items-center gap-1">
        {hasOverride && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() => void submit(null)}
            title="Reset to fleet default"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={pending}
          onClick={onClose}
        >
          <X className="h-3 w-3" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={pending}
          onClick={save}
        >
          <Check className="h-3 w-3" />
          Save
        </Button>
      </div>
      {error && (
        <span className="w-full text-[11px] text-sev-red-fg">{error}</span>
      )}
    </div>
  );
}

const EVENTS_GRID_COLS = "84px minmax(0,1.4fr) minmax(0,1fr) 110px";

const MISSING_INSPECTION_MESSAGE =
  "No scheduled inspections — please create one";

function EventsTab({
  matches,
  readOnly,
  onAdd,
}: {
  matches: MissingEventMatch[];
  readOnly: boolean;
  onAdd: (tail: string) => void;
}) {
  const { airworthy, grounded } = useMemo(() => {
    const a: MissingEventMatch[] = [];
    const g: MissingEventMatch[] = [];
    for (const m of matches) (m.airworthy ? a : g).push(m);
    return { airworthy: a, grounded: g };
  }, [matches]);

  if (matches.length === 0) {
    return (
      <div className="border border-foreground/20 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Every aircraft with recurring inspections has one scheduled. Nothing
        to plan right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {airworthy.length > 0 && (
        <Section
          label="Airworthy"
          count={airworthy.length}
          matches={airworthy}
          readOnly={readOnly}
          onAdd={onAdd}
        />
      )}
      {grounded.length > 0 && (
        <Section
          label="Grounded"
          count={grounded.length}
          matches={grounded}
          readOnly={readOnly}
          onAdd={onAdd}
          tone="grounded"
        />
      )}
    </div>
  );
}

function Section({
  label,
  count,
  matches,
  readOnly,
  onAdd,
  tone,
}: {
  label: string;
  count: number;
  matches: MissingEventMatch[];
  readOnly: boolean;
  onAdd: (tail: string) => void;
  tone?: "grounded";
}) {
  const isGrounded = tone === "grounded";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        {isGrounded && (
          <ShieldOff className="h-3.5 w-3.5 text-sev-red-fg" />
        )}
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-spec",
            isGrounded ? "text-sev-red-fg" : "text-muted-foreground",
          )}
        >
          {label} · {count}
        </span>
        <span
          className={cn(
            "h-px flex-1",
            isGrounded ? "bg-sev-red-edge/40" : "bg-foreground/15",
          )}
        />
      </div>
      <div className="border border-foreground/20 bg-card overflow-hidden">
        <div
          className="grid items-center gap-2 px-3 py-1.5 border-b border-foreground/15 bg-foreground/[0.04] text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
          style={{ gridTemplateColumns: EVENTS_GRID_COLS }}
        >
          <span>Tail</span>
          <span>Status</span>
          <span>Last completed</span>
          <span />
        </div>
        <div className="divide-y divide-foreground/10">
          {matches.map((m) => {
            const lastTemplate = m.lastCompleted
              ? (m.applicableTemplates.find(
                  (t) => t.id === m.lastCompleted!.templateId,
                )?.title ?? "—")
              : null;
            return (
              <div
                key={m.tailNumber}
                className={cn(
                  "grid items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/[0.025]",
                  isGrounded && "opacity-80",
                )}
                style={{ gridTemplateColumns: EVENTS_GRID_COLS }}
              >
                <span className="inline-flex items-center justify-center gap-1 border border-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 font-mono font-bold tracking-stamp text-[11px]">
                  {isGrounded && (
                    <ShieldOff className="h-3 w-3 text-sev-red-fg" />
                  )}
                  {m.tailNumber}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-spec",
                    "border-sev-yellow-edge/60 bg-sev-yellow-bg text-sev-yellow-fg",
                  )}
                >
                  {MISSING_INSPECTION_MESSAGE}
                </span>
                <span className="truncate text-muted-foreground">
                  {m.lastCompleted ? (
                    <span className="font-mono text-[11px]">
                      <span className="text-foreground/80">{lastTemplate}</span>
                      {" · "}
                      {formatDate(m.lastCompleted.resolvedDate)}
                      {m.lastCompleted.resolutionTtafMinutes != null
                        ? ` · TTAF ${formatMinutesAsDuration(
                            m.lastCompleted.resolutionTtafMinutes,
                          )}`
                        : ""}
                      {m.lastCompleted.resolutionWorkOrder
                        ? ` · ${m.lastCompleted.resolutionWorkOrder}`
                        : " · admin close"}
                    </span>
                  ) : (
                    <span className="italic">Never recorded</span>
                  )}
                </span>
                {readOnly ? (
                  <span />
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] justify-self-end"
                    onClick={() => onAdd(m.tailNumber)}
                  >
                    <Plus className="h-3 w-3" />
                    Add event
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
