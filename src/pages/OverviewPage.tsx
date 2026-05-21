import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  ShieldOff,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AircraftCard, {
  type BookingWithLinks,
} from "@/components/overview/AircraftCard";
import EventFormDialog from "@/components/overview/EventFormDialog";
import DeleteEventDialog from "@/components/overview/DeleteEventDialog";
import ImportDialog from "@/components/overview/ImportDialog";
import TtafDialog from "@/components/overview/TtafDialog";
import BookingDialog from "@/components/calendar/BookingDialog";
import BookingViewDialog from "@/components/calendar/BookingViewDialog";
import NoteDialog from "@/components/overview/NoteDialog";
import GroundingDialog from "@/components/overview/GroundingDialog";
import DefectFormDialog from "@/components/overview/DefectFormDialog";
import DeleteDefectDialog from "@/components/overview/DeleteDefectDialog";
import ResolveDefectDialog from "@/components/overview/ResolveDefectDialog";
import DeferDefectDialog from "@/components/overview/DeferDefectDialog";
import DeferralHistoryDialog from "@/components/overview/DeferralHistoryDialog";
import ResolveEventDialog from "@/components/overview/ResolveEventDialog";
import ExtendEventDialog from "@/components/overview/ExtendEventDialog";
import EstimateDialog, {
  type EstimateTarget,
} from "@/components/overview/EstimateDialog";
import UpcomingEventsDialog from "@/components/overview/UpcomingEventsDialog";
import NeedsBookingDialog from "@/components/overview/NeedsBookingDialog";
import HistoryDialog from "@/components/overview/HistoryDialog";
import { useAuth } from "@/context/AuthContext";
import { autoGroundExpired, subscribeAircraft } from "@/services/aircraft";
import { subscribeEvents } from "@/services/events";
import { subscribeDefects } from "@/services/defects";
import {
  clearBookingReminder,
  raiseNotification,
  subscribeBookingReminders,
} from "@/services/notifications";
import { formatDate } from "@/lib/format";
import {
  subscribeBookings,
  upcomingBookingsForTail,
} from "@/services/bookings";
import { subscribeLocations } from "@/services/locations";
import { subscribeUsers } from "@/services/users";
import {
  buildBookedIdSets,
  daysSinceDeferred,
  getDeferralStatus,
  getEventSeverity,
  getNeedsBookingMatches,
  worstSeverity,
  type NeedsBookingMatch,
  type Severity,
} from "@/lib/eventStatus";
import type {
  Aircraft,
  Booking,
  Defect,
  Location,
  MaintenanceEvent,
  Notification,
  UserProfile,
} from "@/types";

// Frozen-message snippet for the booking-reminder banner. Lists up to three
// event titles inline; collapses the rest into a count so very busy tails
// don't spam a paragraph-length banner.
function formatEventList(titles: string[]): string {
  if (titles.length === 0) return "event(s)";
  if (titles.length === 1) return `"${titles[0]}"`;
  if (titles.length === 2) return `"${titles[0]}" and "${titles[1]}"`;
  if (titles.length === 3)
    return `"${titles[0]}", "${titles[1]}" and "${titles[2]}"`;
  return `"${titles[0]}", "${titles[1]}", "${titles[2]}" and ${titles.length - 3} more`;
}

const EVENT_SEVERITY_ORDER: Record<Severity, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  unknown: 3,
};

// Sorts events with WO-grouping: events sharing a workOrderNumber sit
// adjacent to each other. Events with no WO# are each their own group, so
// they slot in by severity/expiry as before. Groups sort by their worst
// event first; within a group, severity then expiry.
function sortEvents(
  events: MaintenanceEvent[],
  currentTtafMinutes: number | null,
): MaintenanceEvent[] {
  type GroupKey = string;
  type Group = {
    key: GroupKey;
    events: MaintenanceEvent[];
    worstRank: number;
    earliestExpiry: number;
  };

  const groups = new Map<GroupKey, Group>();
  let singletonCounter = 0;
  for (const e of events) {
    const wo = e.workOrderNumber?.trim();
    // Blank/null WO# → unique key per event so each becomes its own group.
    const key = wo ? `wo:${wo}` : `solo:${singletonCounter++}`;
    const rank = EVENT_SEVERITY_ORDER[getEventSeverity(e, currentTtafMinutes)];
    const expiry = e.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(e);
      if (rank < existing.worstRank) existing.worstRank = rank;
      if (expiry < existing.earliestExpiry) existing.earliestExpiry = expiry;
    } else {
      groups.set(key, {
        key,
        events: [e],
        worstRank: rank,
        earliestExpiry: expiry,
      });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (a.worstRank !== b.worstRank) return a.worstRank - b.worstRank;
    return a.earliestExpiry - b.earliestExpiry;
  });

  const result: MaintenanceEvent[] = [];
  for (const g of sortedGroups) {
    g.events.sort((a, b) => {
      const sa = EVENT_SEVERITY_ORDER[getEventSeverity(a, currentTtafMinutes)];
      const sb = EVENT_SEVERITY_ORDER[getEventSeverity(b, currentTtafMinutes)];
      if (sa !== sb) return sa - sb;
      const da = a.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
      const db = b.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
    result.push(...g.events);
  }
  return result;
}

type SortKey = "severity" | "tail" | "model" | "ttaf" | "due";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "tail", label: "Tail", defaultDir: "asc" },
  { key: "due", label: "Next due", defaultDir: "asc" },
  { key: "severity", label: "Severity", defaultDir: "desc" },
  { key: "ttaf", label: "TTAF", defaultDir: "desc" },
  { key: "model", label: "Model", defaultDir: "asc" },
];

const FLEET_SEVERITY_RANK: Record<Severity, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  red: 3,
};

const PILL_TINT: Record<Severity, string> = {
  red: "border-sev-red-edge/60 bg-sev-red-bg/70 text-sev-red-fg hover:bg-sev-red-bg",
  yellow:
    "border-sev-yellow-edge/60 bg-sev-yellow-bg/70 text-sev-yellow-fg hover:bg-sev-yellow-bg",
  green:
    "border-sev-green-edge/60 bg-sev-green-bg/70 text-sev-green-fg hover:bg-sev-green-bg",
  unknown:
    "border-foreground/25 bg-card text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
};

const PILL_TINT_ACTIVE: Record<Severity, string> = {
  red: "border-sev-red-fg bg-sev-red-fg text-card",
  yellow: "border-sev-yellow-fg bg-sev-yellow-fg text-card",
  green: "border-sev-green-fg bg-sev-green-fg text-card",
  unknown: "border-foreground bg-foreground text-background",
};

function TailPill({
  tail,
  severity,
  active,
  grounded = false,
  onClick,
}: {
  tail: string;
  severity: Severity;
  active: boolean;
  grounded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={grounded ? `${tail} (grounded)` : tail}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 border px-1 py-0.5 font-mono text-[11px] font-semibold tracking-stamp transition-colors",
        active ? PILL_TINT_ACTIVE[severity] : PILL_TINT[severity],
        grounded && "opacity-60",
      )}
    >
      {grounded && <ShieldOff className="h-3 w-3" />}
      {tail}
    </button>
  );
}

type AircraftSummary = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
  bookings: BookingWithLinks[];
  worst: Severity;
  earliestDueMillis: number | null;
  airworthy: boolean;
};

function compareNullable(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls always last
  if (b == null) return -1;
  return (a - b) * dir;
}

export default function OverviewPage() {
  const { isViewer, user } = useAuth();
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [allEvents, setAllEvents] = useState<MaintenanceEvent[]>([]);
  const [allDefects, setAllDefects] = useState<Defect[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("tail");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Tracks which aircraft card is currently in the viewport "reading zone"
  // (just below the sticky header + jump bar) so the matching pill can light
  // up. Updated by the IntersectionObserver below.
  const [activeTail, setActiveTail] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const visibleTails = useRef<Set<string>>(new Set());

  // Guards the auto-ground sweep so re-renders during the in-flight Firestore
  // writes don't fire a second concurrent pass (idempotent at the service
  // layer, but the ref keeps writes out of the network in the common case).
  const autoGroundProcessing = useRef(false);
  const deferralScanProcessing = useRef(false);
  const bookingReminderProcessing = useRef(false);

  const [bookingReminders, setBookingReminders] = useState<Notification[]>([]);

  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventFormTail, setEventFormTail] = useState<string>("");
  const [eventFormTarget, setEventFormTarget] =
    useState<MaintenanceEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceEvent | null>(
    null,
  );
  const [resolveEventTarget, setResolveEventTarget] =
    useState<MaintenanceEvent | null>(null);
  const [extendEventTarget, setExtendEventTarget] =
    useState<MaintenanceEvent | null>(null);
  const [estimateTarget, setEstimateTarget] =
    useState<EstimateTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ttafTarget, setTtafTarget] = useState<Aircraft | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingPrefillTail, setBookingPrefillTail] = useState<string>("");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [noteTarget, setNoteTarget] = useState<Aircraft | null>(null);
  const [groundingTarget, setGroundingTarget] = useState<Aircraft | null>(null);

  const [defectFormOpen, setDefectFormOpen] = useState(false);
  const [defectFormTail, setDefectFormTail] = useState("");
  const [defectFormTarget, setDefectFormTarget] = useState<Defect | null>(null);
  const [defectDeleteTarget, setDefectDeleteTarget] = useState<Defect | null>(
    null,
  );
  const [defectResolveTarget, setDefectResolveTarget] = useState<Defect | null>(
    null,
  );
  const [defectDeferTarget, setDefectDeferTarget] = useState<Defect | null>(
    null,
  );
  const [deferralHistoryTarget, setDeferralHistoryTarget] =
    useState<Defect | null>(null);
  const [historyTail, setHistoryTail] = useState<string | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [needsBookingOpen, setNeedsBookingOpen] = useState(false);

  useEffect(() => subscribeAircraft(setAircraft), []);
  useEffect(() => subscribeEvents(setAllEvents), []);
  useEffect(() => subscribeDefects(setAllDefects), []);
  useEffect(() => subscribeBookings(setAllBookings), []);
  useEffect(() => subscribeLocations(setAllLocations), []);
  useEffect(() => subscribeUsers(setAllUsers), []);
  useEffect(() => {
    if (isViewer) return;
    return subscribeBookingReminders(setBookingReminders);
  }, [isViewer]);

  // Auto-ground sweep: walks airworthy aircraft for expired events and
  // grounds them, raising a banner notification per grounding. Runs client-
  // side on every aircraft/events change because the app stays open all day
  // and SEP wants the grounded state to surface the moment anyone loads the
  // overview. Skipped entirely for view-only users — they neither write nor
  // see banners.
  useEffect(() => {
    if (isViewer || !user || !aircraft) return;
    if (autoGroundProcessing.current) return;
    let cancelled = false;
    autoGroundProcessing.current = true;
    (async () => {
      try {
        const grounded = await autoGroundExpired(user.uid, aircraft, allEvents);
        if (cancelled) return;
        await Promise.all(
          grounded.map(({ tail, event }) => {
            const dueStr = event.expiryDate
              ? ` on ${formatDate(event.expiryDate)}`
              : "";
            return raiseNotification({
              type: "auto-grounded",
              tailNumber: tail,
              eventId: event.id,
              message: `${tail} grounded — event "${event.warning}" expired${dueStr}.`,
            });
          }),
        );
      } catch (err) {
        console.error("autoGroundExpired sweep failed", err);
      } finally {
        autoGroundProcessing.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewer, user, aircraft, allEvents]);

  // Deferral-overdue sweep: any active defect past its 30-day review window
  // raises a gentle banner reminding CAMO to either extend (re-defer) or
  // resolve. Re-deferring or resolving clears the banner in the service so a
  // new one only re-raises after the next full window.
  useEffect(() => {
    if (isViewer || !user) return;
    if (deferralScanProcessing.current) return;
    const overdue = allDefects.filter(
      (d) => !d.resolvedAt && getDeferralStatus(d) === "overdue",
    );
    if (overdue.length === 0) return;
    let cancelled = false;
    deferralScanProcessing.current = true;
    (async () => {
      try {
        await Promise.all(
          overdue.map((d) => {
            const days = daysSinceDeferred(d) ?? 30;
            return raiseNotification({
              type: "deferral-overdue",
              tailNumber: d.tailNumber,
              defectId: d.id,
              message: `CAMO reminder: deferred defect "${d.title}" on ${d.tailNumber} is past 30 days (${days}d) — please review.`,
            });
          }),
        );
        if (cancelled) return;
      } catch (err) {
        console.error("deferral-overdue sweep failed", err);
      } finally {
        deferralScanProcessing.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewer, user, allDefects]);

  const usersByUid = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const u of allUsers) m.set(u.uid, u);
    return m;
  }, [allUsers]);

  const historyDefects = useMemo(
    () =>
      historyTail
        ? allDefects.filter((d) => d.tailNumber === historyTail)
        : [],
    [historyTail, allDefects],
  );

  const historyEvents = useMemo(
    () =>
      historyTail
        ? allEvents.filter((e) => e.tailNumber === historyTail)
        : [],
    [historyTail, allEvents],
  );

  const defectFormTailDefects = useMemo(
    () =>
      defectFormTail
        ? allDefects.filter((d) => d.tailNumber === defectFormTail)
        : [],
    [defectFormTail, allDefects],
  );

  const eventsById = useMemo(() => {
    const m = new Map<string, MaintenanceEvent>();
    for (const e of allEvents) m.set(e.id, e);
    return m;
  }, [allEvents]);

  const defectsById = useMemo(() => {
    const m = new Map<string, Defect>();
    for (const d of allDefects) m.set(d.id, d);
    return m;
  }, [allDefects]);

  const locationsById = useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of allLocations) m.set(l.id, l);
    return m;
  }, [allLocations]);

  const bookedIds = useMemo(
    () => buildBookedIdSets(allBookings, eventsById, defectsById),
    [allBookings, eventsById, defectsById],
  );

  const needsBookingMatches: NeedsBookingMatch[] = useMemo(() => {
    if (!aircraft) return [];
    const ttafByTail = new Map<string, number | null>();
    const airworthyTails = new Set<string>();
    for (const a of aircraft) {
      ttafByTail.set(a.tailNumber, a.totalTimeMinutes);
      if (a.airworthy !== false) airworthyTails.add(a.tailNumber);
    }
    return getNeedsBookingMatches(
      allEvents,
      ttafByTail,
      airworthyTails,
      bookedIds.eventIds,
    );
  }, [aircraft, allEvents, bookedIds.eventIds]);

  const needsBookingByTail: Map<string, NeedsBookingMatch[]> = useMemo(() => {
    const m = new Map<string, NeedsBookingMatch[]>();
    for (const match of needsBookingMatches) {
      const arr = m.get(match.event.tailNumber) ?? [];
      arr.push(match);
      m.set(match.event.tailNumber, arr);
    }
    return m;
  }, [needsBookingMatches]);

  // Reconciliation sweep: raises one booking-reminder banner per tail that has
  // qualifying events, and clears the banner for any tail that no longer has
  // any. Driven off the existing `bookingReminders` subscription so writes only
  // fire when state actually changes (no per-scan delete churn).
  useEffect(() => {
    if (isViewer || !user || !aircraft) return;
    if (bookingReminderProcessing.current) return;

    const existingTails = new Set<string>();
    for (const n of bookingReminders) existingTails.add(n.tailNumber);

    const matchedTails = new Set<string>(needsBookingByTail.keys());
    const airworthyTails = new Set<string>();
    for (const a of aircraft) {
      if (a.airworthy !== false) airworthyTails.add(a.tailNumber);
    }

    const toRaise: { tail: string; matches: NeedsBookingMatch[] }[] = [];
    const toClear: string[] = [];
    for (const tail of matchedTails) {
      if (!existingTails.has(tail)) {
        toRaise.push({ tail, matches: needsBookingByTail.get(tail) ?? [] });
      }
    }
    for (const tail of existingTails) {
      // Clear if the tail no longer has matches OR has been grounded since the
      // banner was raised (grounded planes don't need a hangar reminder).
      if (!matchedTails.has(tail) || !airworthyTails.has(tail)) {
        toClear.push(tail);
      }
    }
    if (toRaise.length === 0 && toClear.length === 0) return;

    let cancelled = false;
    bookingReminderProcessing.current = true;
    (async () => {
      try {
        await Promise.all([
          ...toRaise.map(({ tail, matches }) =>
            raiseNotification({
              type: "booking-reminder",
              tailNumber: tail,
              message: `${tail}: ${formatEventList(
                matches.map((m) => m.event.warning),
              )} approaching expiry with no booking — book a hangar slot.`,
            }),
          ),
          ...toClear.map((tail) => clearBookingReminder(tail)),
        ]);
        if (cancelled) return;
      } catch (err) {
        console.error("booking-reminder sweep failed", err);
      } finally {
        bookingReminderProcessing.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewer, user, aircraft, needsBookingByTail, bookingReminders]);

  const summaries: AircraftSummary[] = useMemo(() => {
    if (!aircraft) return [];
    const eventsByTail = new Map<string, MaintenanceEvent[]>();
    for (const e of allEvents) {
      if (e.resolvedAt) continue; // closed events stay as legacy in Firestore
      const arr = eventsByTail.get(e.tailNumber) ?? [];
      arr.push(e);
      eventsByTail.set(e.tailNumber, arr);
    }
    const defectsByTail = new Map<string, Defect[]>();
    for (const d of allDefects) {
      if (d.resolvedAt) continue; // resolved defects stay as legacy in Firestore
      const arr = defectsByTail.get(d.tailNumber) ?? [];
      arr.push(d);
      defectsByTail.set(d.tailNumber, arr);
    }

    return aircraft.map((a) => {
      const events = eventsByTail.get(a.tailNumber) ?? [];
      let worst: Severity = "unknown";
      let earliestDueMillis: number | null = null;
      for (const e of events) {
        const s = getEventSeverity(e, a.totalTimeMinutes);
        worst = worstSeverity(worst, s);
        const due = e.expiryDate?.toMillis() ?? null;
        if (
          due != null &&
          (earliestDueMillis == null || due < earliestDueMillis)
        ) {
          earliestDueMillis = due;
        }
      }
      const tailBookings = upcomingBookingsForTail(allBookings, a.tailNumber);
      const bookings: BookingWithLinks[] = tailBookings.map((b) => ({
        booking: b,
        event: b.eventId ? eventsById.get(b.eventId) ?? null : null,
        defects: b.defectIds
          .map((id) => defectsById.get(id))
          .filter((d): d is Defect => !!d),
      }));
      return {
        aircraft: a,
        events: sortEvents(events, a.totalTimeMinutes),
        defects: defectsByTail.get(a.tailNumber) ?? [],
        bookings,
        worst,
        earliestDueMillis,
        airworthy: a.airworthy !== false,
      };
    });
  }, [aircraft, allEvents, allDefects, allBookings, eventsById, defectsById]);

  const sortFn = useMemo(() => {
    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const tieBreaker = (a: AircraftSummary, b: AircraftSummary) =>
      a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber);
    return (a: AircraftSummary, b: AircraftSummary) => {
      let cmp = 0;
      switch (sortKey) {
        case "severity":
          cmp =
            (FLEET_SEVERITY_RANK[a.worst] - FLEET_SEVERITY_RANK[b.worst]) * dir;
          break;
        case "tail":
          cmp =
            a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber) * dir;
          break;
        case "model":
          cmp = a.aircraft.model.localeCompare(b.aircraft.model) * dir;
          break;
        case "ttaf":
          cmp = compareNullable(
            a.aircraft.totalTimeMinutes,
            b.aircraft.totalTimeMinutes,
            dir,
          );
          break;
        case "due":
          cmp = compareNullable(a.earliestDueMillis, b.earliestDueMillis, dir);
          break;
      }
      return cmp !== 0 ? cmp : tieBreaker(a, b);
    };
  }, [sortKey, sortDir]);

  const { airworthyList, groundedList } = useMemo(() => {
    const aw: AircraftSummary[] = [];
    const gr: AircraftSummary[] = [];
    for (const s of summaries) {
      (s.airworthy ? aw : gr).push(s);
    }
    aw.sort(sortFn);
    gr.sort(sortFn);
    return { airworthyList: aw, groundedList: gr };
  }, [summaries, sortFn]);

  // Pills are sorted alphabetically and stay in fixed positions regardless of
  // the card sort order — that keeps muscle memory intact when jumping.
  const { airworthyPills, groundedPills } = useMemo(() => {
    const sorted = [...summaries].sort((a, b) =>
      a.aircraft.tailNumber.localeCompare(b.aircraft.tailNumber),
    );
    return {
      airworthyPills: sorted.filter((s) => s.airworthy),
      groundedPills: sorted.filter((s) => !s.airworthy),
    };
  }, [summaries]);

  const jumpToTail = (tail: string) => {
    const el = cardRefs.current.get(tail);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveTail(tail);
  };

  // Scrollspy: highlight the pill whose card sits in the top ~35% band of the
  // viewport (just below the sticky header + jump bar). When several cards
  // intersect at once, the topmost one wins so the active pill tracks the
  // card you're currently reading.
  useEffect(() => {
    if (summaries.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tail = (entry.target as HTMLElement).dataset.tail;
          if (!tail) continue;
          if (entry.isIntersecting) visibleTails.current.add(tail);
          else visibleTails.current.delete(tail);
        }
        let topTail: string | null = null;
        let topPos = Number.POSITIVE_INFINITY;
        for (const tail of visibleTails.current) {
          const el = cardRefs.current.get(tail);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top < topPos) {
            topPos = top;
            topTail = tail;
          }
        }
        if (topTail) setActiveTail(topTail);
      },
      { rootMargin: "-100px 0px -65% 0px" },
    );
    for (const el of cardRefs.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      visibleTails.current.clear();
    };
  }, [summaries.length, airworthyList, groundedList]);

  const onSortClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const opt = SORT_OPTIONS.find((o) => o.key === key);
      setSortDir(opt?.defaultDir ?? "asc");
    }
  };

  const openAddDefect = (tailNumber: string) => {
    setDefectFormTail(tailNumber);
    setDefectFormTarget(null);
    setDefectFormOpen(true);
  };

  const openEditDefect = (defect: Defect) => {
    setDefectFormTail(defect.tailNumber);
    setDefectFormTarget(defect);
    setDefectFormOpen(true);
  };

  const openAddEvent = (tailNumber: string) => {
    setEventFormTail(tailNumber);
    setEventFormTarget(null);
    setEventFormOpen(true);
  };

  const openEditEvent = (event: MaintenanceEvent) => {
    setEventFormTail(event.tailNumber);
    setEventFormTarget(event);
    setEventFormOpen(true);
  };

  const openAddBooking = (tailNumber: string) => {
    setEditingBooking(null);
    setBookingPrefillTail(tailNumber);
    setBookingDialogOpen(true);
  };

  // Keep the view dialog showing live data if the booking is updated upstream.
  const liveViewingBooking = useMemo(() => {
    if (!viewingBooking) return null;
    return allBookings.find((b) => b.id === viewingBooking.id) ?? viewingBooking;
  }, [allBookings, viewingBooking]);

  // Same pattern for the deferral history dialog: keep the current-state
  // banner in sync if the user re-defers / lifts while it's open.
  const liveDeferralHistoryTarget = useMemo(() => {
    if (!deferralHistoryTarget) return null;
    return (
      allDefects.find((d) => d.id === deferralHistoryTarget.id) ??
      deferralHistoryTarget
    );
  }, [allDefects, deferralHistoryTarget]);

  const promoteViewToEdit = () => {
    if (!viewingBooking) return;
    const target = viewingBooking;
    setViewingBooking(null);
    setEditingBooking(target);
    setBookingPrefillTail("");
    setBookingDialogOpen(true);
  };

  const setCardRef = (tail: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(tail, el);
    else cardRefs.current.delete(tail);
  };

  const renderCard = (s: AircraftSummary) => (
    <div
      key={s.aircraft.tailNumber}
      ref={setCardRef(s.aircraft.tailNumber)}
      data-tail={s.aircraft.tailNumber}
      className="scroll-mt-36"
    >
    <AircraftCard
      aircraft={s.aircraft}
      events={s.events}
      defects={s.defects}
      bookings={s.bookings}
      worstSeverity={s.worst}
      airworthy={s.airworthy}
      bookedEventIds={bookedIds.eventIds}
      bookedDefectIds={bookedIds.defectIds}
      locationsById={locationsById}
      readOnly={isViewer}
      onOpenEditLog={() => setHistoryTail(s.aircraft.tailNumber)}
      onUpdateTtaf={() => setTtafTarget(s.aircraft)}
      onAddBooking={() => openAddBooking(s.aircraft.tailNumber)}
      onViewBooking={setViewingBooking}
      onGround={() => setGroundingTarget(s.aircraft)}
      onAddEvent={() => openAddEvent(s.aircraft.tailNumber)}
      onEditEvent={openEditEvent}
      onDeleteEvent={setDeleteTarget}
      onResolveEvent={setResolveEventTarget}
      onExtendEvent={setExtendEventTarget}
      onEstimateEvent={(event) =>
        setEstimateTarget({ kind: "event", event })
      }
      onAddDefect={() => openAddDefect(s.aircraft.tailNumber)}
      onEditDefect={openEditDefect}
      onDeleteDefect={setDefectDeleteTarget}
      onResolveDefect={setDefectResolveTarget}
      onDeferDefect={setDefectDeferTarget}
      onViewDeferralHistory={setDeferralHistoryTarget}
      onEstimateDefect={(defect) =>
        setEstimateTarget({ kind: "defect", defect })
      }
      onEditNote={() => setNoteTarget(s.aircraft)}
      // Click-throughs from the grounding-cause banner. Defects open the
      // resolve dialog (the most common next action — resolving lifts the
      // grounding automatically); events use the edit dialog since closing
      // them has its own dedicated row action.
      onOpenLinkedDefect={(defect) => setDefectResolveTarget(defect)}
      onOpenLinkedEvent={(event) => openEditEvent(event)}
    />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
              01 / Overview
            </span>
            <span className="h-px flex-1 bg-foreground/15 w-12" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
            Maintenance Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Fleet status, grouped by tail number ·{" "}
            <span className="font-semibold text-foreground">
              {airworthyList.length}
            </span>{" "}
            airworthy
            {groundedList.length > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-sev-red-fg">
                  {groundedList.length}
                </span>{" "}
                grounded
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={() => setUpcomingOpen(true)}
            size="sm"
            variant="outline"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Upcoming events
          </Button>
          <Button
            onClick={() => setNeedsBookingOpen(true)}
            size="sm"
            variant="outline"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Needs booking
            {needsBookingMatches.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center bg-accent text-accent-foreground px-1.5 min-w-[1.25rem] h-5 text-[10px] font-bold tabular-nums">
                {needsBookingMatches.length}
              </span>
            )}
          </Button>
          {!isViewer && (
            <Button onClick={() => setImportOpen(true)} size="sm">
              <Upload className="h-3.5 w-3.5" />
              Import flight data
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch border border-foreground/20 bg-card divide-x divide-foreground/10">
        <span className="inline-flex items-center px-3 text-[10px] font-bold uppercase tracking-spec text-muted-foreground bg-foreground/[0.04]">
          Sort
        </span>
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSortClick(opt.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-spec transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              {opt.label}
              {active &&
                (sortDir === "asc" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </button>
          );
        })}
      </div>

      {summaries.length > 0 && (
        <div className="sticky top-[90px] z-30 flex items-stretch border border-foreground/20 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <span className="inline-flex shrink-0 items-center px-3 text-[10px] font-bold uppercase tracking-spec text-muted-foreground bg-foreground/[0.04] border-r border-foreground/10">
            Jump
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]">
            {airworthyPills.map((s) => (
              <TailPill
                key={s.aircraft.tailNumber}
                tail={s.aircraft.tailNumber}
                severity={s.worst}
                active={s.aircraft.tailNumber === activeTail}
                onClick={() => jumpToTail(s.aircraft.tailNumber)}
              />
            ))}
            {groundedPills.length > 0 && (
              <>
                <span
                  className="mx-1 h-5 w-px shrink-0 bg-foreground/20"
                  aria-hidden="true"
                />
                {groundedPills.map((s) => (
                  <TailPill
                    key={s.aircraft.tailNumber}
                    tail={s.aircraft.tailNumber}
                    severity={s.worst}
                    grounded
                    active={s.aircraft.tailNumber === activeTail}
                    onClick={() => jumpToTail(s.aircraft.tailNumber)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {aircraft === null && (
        <p className="text-sm text-muted-foreground italic">Loading fleet…</p>
      )}
      {aircraft !== null && aircraft.length === 0 && (
        <div className="border border-dashed border-foreground/25 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No aircraft yet. Head over to the <b>Aircraft</b> tab and click{" "}
            <b>Seed fleet</b> to get started.
          </p>
        </div>
      )}
      {aircraft && aircraft.length > 0 && (
        <>
          <div className="space-y-4">{airworthyList.map(renderCard)}</div>

          {groundedList.length > 0 && (
            <div className="pt-5 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldOff className="h-4 w-4 text-sev-red-fg" />
                <h2 className="font-display text-sm font-bold uppercase tracking-spec text-sev-red-fg">
                  Grounded · {groundedList.length}
                </h2>
                <span className="h-px flex-1 bg-sev-red-edge/40" />
              </div>
              {groundedList.map(renderCard)}
            </div>
          )}
        </>
      )}

      <EventFormDialog
        open={eventFormOpen}
        onOpenChange={setEventFormOpen}
        tailNumber={eventFormTail}
        event={eventFormTarget}
      />
      <DeleteEventDialog
        event={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
      <ResolveEventDialog
        event={resolveEventTarget}
        onClose={() => setResolveEventTarget(null)}
      />
      <ExtendEventDialog
        event={extendEventTarget}
        onClose={() => setExtendEventTarget(null)}
      />
      <EstimateDialog
        target={estimateTarget}
        onClose={() => setEstimateTarget(null)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TtafDialog
        aircraft={ttafTarget}
        onClose={() => setTtafTarget(null)}
      />
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={(open) => {
          setBookingDialogOpen(open);
          if (!open) setEditingBooking(null);
        }}
        fleet={aircraft ?? []}
        events={allEvents}
        defects={allDefects}
        booking={editingBooking}
        prefill={{ tailNumber: bookingPrefillTail }}
      />
      <BookingViewDialog
        booking={liveViewingBooking}
        events={allEvents}
        defects={allDefects}
        locations={allLocations}
        onClose={() => setViewingBooking(null)}
        onEdit={promoteViewToEdit}
        readOnly={isViewer}
      />
      <NoteDialog
        aircraft={noteTarget}
        onClose={() => setNoteTarget(null)}
      />
      <GroundingDialog
        aircraft={groundingTarget}
        openDefects={
          groundingTarget
            ? allDefects.filter(
                (d) =>
                  d.tailNumber === groundingTarget.tailNumber && !d.resolvedAt,
              )
            : []
        }
        openEvents={
          groundingTarget
            ? allEvents.filter(
                (e) =>
                  e.tailNumber === groundingTarget.tailNumber && !e.resolvedAt,
              )
            : []
        }
        onClose={() => setGroundingTarget(null)}
      />
      <DefectFormDialog
        open={defectFormOpen}
        onOpenChange={setDefectFormOpen}
        tailNumber={defectFormTail}
        defect={defectFormTarget}
        tailDefects={defectFormTailDefects}
      />
      <DeleteDefectDialog
        defect={defectDeleteTarget}
        onClose={() => setDefectDeleteTarget(null)}
      />
      <ResolveDefectDialog
        defect={defectResolveTarget}
        onClose={() => setDefectResolveTarget(null)}
      />
      <DeferDefectDialog
        defect={defectDeferTarget}
        onClose={() => setDefectDeferTarget(null)}
      />
      <DeferralHistoryDialog
        defect={liveDeferralHistoryTarget}
        onClose={() => setDeferralHistoryTarget(null)}
      />
      <HistoryDialog
        tailNumber={historyTail}
        defects={historyDefects}
        events={historyEvents}
        usersByUid={usersByUid}
        onClose={() => setHistoryTail(null)}
      />
      <UpcomingEventsDialog
        open={upcomingOpen}
        onOpenChange={setUpcomingOpen}
        aircraft={aircraft ?? []}
        events={allEvents.filter((e) => !e.resolvedAt)}
      />
      <NeedsBookingDialog
        open={needsBookingOpen}
        onOpenChange={setNeedsBookingOpen}
        matches={needsBookingMatches}
        readOnly={isViewer}
        onBook={openAddBooking}
      />
    </div>
  );
}
