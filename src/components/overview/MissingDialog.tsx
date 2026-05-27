import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Plus,
  ShieldOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import type {
  MissingEventMatch,
  NeedsBookingMatch,
} from "@/lib/eventStatus";

type Tab = "bookings" | "events";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingMatches: NeedsBookingMatch[];
  eventMatches: MissingEventMatch[];
  readOnly: boolean;
  onBook: (tailNumber: string) => void;
  onAddEvent: (tailNumber: string) => void;
};

export default function MissingDialog({
  open,
  onOpenChange,
  bookingMatches,
  eventMatches,
  readOnly,
  onBook,
  onAddEvent,
}: Props) {
  // Default tab on open = whichever has more matches. Ties → Bookings, so the
  // existing muscle memory holds.
  const [tab, setTab] = useState<Tab>("bookings");
  useEffect(() => {
    if (!open) return;
    setTab(eventMatches.length > bookingMatches.length ? "events" : "bookings");
  }, [open, bookingMatches.length, eventMatches.length]);

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
            count={bookingMatches.length}
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

function BookingsTab({
  matches,
  readOnly,
  onBook,
}: {
  matches: NeedsBookingMatch[];
  readOnly: boolean;
  onBook: (tail: string) => void;
}) {
  const rows = useMemo(() => {
    // Hours-matches sort by remaining minutes; date-matches by days-as-minutes
    // so the two share a comparable urgency axis with hours typically
    // appearing first (smaller numbers = more urgent).
    return [...matches]
      .map((m) => ({
        ...m,
        sortKey: m.reason === "hours" ? m.remaining : m.remaining * 24 * 60,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [matches]);

  if (rows.length === 0) {
    return (
      <div className="border border-foreground/20 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing in the booking window right now.
      </div>
    );
  }

  return (
    <div className="border border-foreground/20 bg-card overflow-hidden">
      <div className="grid items-center gap-2 px-3 py-1.5 border-b border-foreground/15 bg-foreground/[0.04] text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
        style={{ gridTemplateColumns: "84px minmax(0,1fr) 110px 96px 80px" }}
      >
        <span>Tail</span>
        <span>Event</span>
        <span className="justify-self-end">Due at</span>
        <span className="justify-self-center">Time left</span>
        <span />
      </div>
      <div className="divide-y divide-foreground/10">
        {rows.map((r) => {
          const primary =
            r.reason === "hours"
              ? formatMinutesAsDuration(r.event.timerExpiryTimeMinutes)
              : formatDate(r.event.expiryDate);
          const metric =
            r.reason === "hours"
              ? `${formatHoursLeft(r.remaining)} hrs`
              : `${r.remaining}d`;
          return (
            <div
              key={r.event.id}
              className="grid items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/[0.025]"
              style={{
                gridTemplateColumns: "84px minmax(0,1fr) 110px 96px 80px",
              }}
            >
              <span className="inline-flex items-center justify-center border border-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 font-mono font-bold tracking-stamp text-[11px]">
                {r.event.tailNumber}
              </span>
              <span className="truncate" title={r.event.warning}>
                {r.event.warning}
                {r.event.status === "planned" && (
                  <span className="ml-1.5 inline-flex items-center border border-sev-green-edge/50 bg-sev-green-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-sev-green-fg align-middle">
                    planned
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground justify-self-end">
                {primary}
              </span>
              <span
                className={cn(
                  "inline-flex w-full items-center justify-center border px-1.5 py-0.5 font-mono text-xs tabular-nums whitespace-nowrap",
                  "bg-sev-yellow-bg text-sev-yellow-fg border-sev-yellow-edge/60",
                )}
              >
                {metric}
              </span>
              {readOnly ? (
                <span />
              ) : (
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
          );
        })}
      </div>
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
                    "inline-flex items-center self-start border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-spec",
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
