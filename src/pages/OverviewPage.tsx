import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ShieldOff, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AircraftCard from "@/components/overview/AircraftCard";
import EventFormDialog from "@/components/overview/EventFormDialog";
import DeleteEventDialog from "@/components/overview/DeleteEventDialog";
import ImportDialog from "@/components/overview/ImportDialog";
import TtafDialog from "@/components/overview/TtafDialog";
import BookedMaintenanceDialog from "@/components/overview/BookedMaintenanceDialog";
import DefectFormDialog from "@/components/overview/DefectFormDialog";
import DeleteDefectDialog from "@/components/overview/DeleteDefectDialog";
import AuditLogDialog from "@/components/overview/AuditLogDialog";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeEvents } from "@/services/events";
import { subscribeDefects } from "@/services/defects";
import {
  getEventSeverity,
  worstSeverity,
  type Severity,
} from "@/lib/eventStatus";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

const EVENT_SEVERITY_ORDER: Record<Severity, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  unknown: 3,
};

function sortEvents(
  events: MaintenanceEvent[],
  currentTtafMinutes: number | null,
): MaintenanceEvent[] {
  return [...events].sort((a, b) => {
    const sa = getEventSeverity(a, currentTtafMinutes);
    const sb = getEventSeverity(b, currentTtafMinutes);
    const diff = EVENT_SEVERITY_ORDER[sa] - EVENT_SEVERITY_ORDER[sb];
    if (diff !== 0) return diff;
    const da = a.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    const db = b.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

type SortKey = "severity" | "tail" | "model" | "ttaf" | "due";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "severity", label: "Severity", defaultDir: "desc" },
  { key: "tail", label: "Tail", defaultDir: "asc" },
  { key: "model", label: "Model", defaultDir: "asc" },
  { key: "ttaf", label: "TTAF", defaultDir: "desc" },
  { key: "due", label: "Next due", defaultDir: "asc" },
];

const FLEET_SEVERITY_RANK: Record<Severity, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  red: 3,
};

type AircraftSummary = {
  aircraft: Aircraft;
  events: MaintenanceEvent[];
  defects: Defect[];
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
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [allEvents, setAllEvents] = useState<MaintenanceEvent[]>([]);
  const [allDefects, setAllDefects] = useState<Defect[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventFormTail, setEventFormTail] = useState<string>("");
  const [eventFormTarget, setEventFormTarget] =
    useState<MaintenanceEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceEvent | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);
  const [ttafTarget, setTtafTarget] = useState<Aircraft | null>(null);
  const [bookedTarget, setBookedTarget] = useState<Aircraft | null>(null);

  const [defectFormOpen, setDefectFormOpen] = useState(false);
  const [defectFormTail, setDefectFormTail] = useState("");
  const [defectFormTarget, setDefectFormTarget] = useState<Defect | null>(null);
  const [defectDeleteTarget, setDefectDeleteTarget] = useState<Defect | null>(
    null,
  );
  const [auditLogTail, setAuditLogTail] = useState<string | null>(null);

  useEffect(() => subscribeAircraft(setAircraft), []);
  useEffect(() => subscribeEvents(setAllEvents), []);
  useEffect(() => subscribeDefects(setAllDefects), []);

  const summaries: AircraftSummary[] = useMemo(() => {
    if (!aircraft) return [];
    const eventsByTail = new Map<string, MaintenanceEvent[]>();
    for (const e of allEvents) {
      const arr = eventsByTail.get(e.tailNumber) ?? [];
      arr.push(e);
      eventsByTail.set(e.tailNumber, arr);
    }
    const defectsByTail = new Map<string, Defect[]>();
    for (const d of allDefects) {
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
      return {
        aircraft: a,
        events: sortEvents(events, a.totalTimeMinutes),
        defects: defectsByTail.get(a.tailNumber) ?? [],
        worst,
        earliestDueMillis,
        airworthy: a.airworthy !== false,
      };
    });
  }, [aircraft, allEvents, allDefects]);

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

  const renderCard = (s: AircraftSummary) => (
    <AircraftCard
      key={s.aircraft.tailNumber}
      aircraft={s.aircraft}
      events={s.events}
      defects={s.defects}
      worstSeverity={s.worst}
      airworthy={s.airworthy}
      onOpenEditLog={() => setAuditLogTail(s.aircraft.tailNumber)}
      onUpdateTtaf={() => setTtafTarget(s.aircraft)}
      onEditBooked={() => setBookedTarget(s.aircraft)}
      onAddEvent={() => openAddEvent(s.aircraft.tailNumber)}
      onEditEvent={openEditEvent}
      onDeleteEvent={setDeleteTarget}
      onAddDefect={() => openAddDefect(s.aircraft.tailNumber)}
      onEditDefect={openEditDefect}
      onDeleteDefect={setDefectDeleteTarget}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Maintenance Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Fleet status, grouped by tail number.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)} size="sm">
          <Upload className="h-4 w-4" />
          Import flight data
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5">
        <span className="text-xs text-muted-foreground mr-1">Sort:</span>
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSortClick(opt.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
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
        <span className="ml-auto text-xs text-muted-foreground">
          {airworthyList.length} airworthy
          {groundedList.length > 0 && ` · ${groundedList.length} grounded`}
        </span>
      </div>

      {aircraft === null && (
        <p className="text-sm text-muted-foreground">Loading fleet…</p>
      )}
      {aircraft !== null && aircraft.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No aircraft yet. Head over to the <b>Aircraft</b> tab and click{" "}
            <b>Seed fleet</b> to get started.
          </p>
        </div>
      )}
      {aircraft && aircraft.length > 0 && (
        <>
          <div className="space-y-2">{airworthyList.map(renderCard)}</div>

          {groundedList.length > 0 && (
            <div className="pt-4 space-y-2">
              <div className="flex items-center gap-2 px-1">
                <ShieldOff className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-destructive">
                  Grounded ({groundedList.length})
                </h2>
                <div className="flex-1 border-t border-destructive/30 ml-2" />
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
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TtafDialog
        aircraft={ttafTarget}
        onClose={() => setTtafTarget(null)}
      />
      <BookedMaintenanceDialog
        aircraft={bookedTarget}
        onClose={() => setBookedTarget(null)}
      />
      <DefectFormDialog
        open={defectFormOpen}
        onOpenChange={setDefectFormOpen}
        tailNumber={defectFormTail}
        defect={defectFormTarget}
      />
      <DeleteDefectDialog
        defect={defectDeleteTarget}
        onClose={() => setDefectDeleteTarget(null)}
      />
      <AuditLogDialog
        tailNumber={auditLogTail}
        onClose={() => setAuditLogTail(null)}
      />
    </div>
  );
}
