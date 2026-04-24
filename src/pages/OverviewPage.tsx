import { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getEventSeverity } from "@/lib/eventStatus";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

const SEVERITY_ORDER = { red: 0, yellow: 1, green: 2, unknown: 3 } as const;

function sortEvents(
  events: MaintenanceEvent[],
  currentTtafMinutes: number | null,
): MaintenanceEvent[] {
  return [...events].sort((a, b) => {
    const sa = getEventSeverity(a, currentTtafMinutes);
    const sb = getEventSeverity(b, currentTtafMinutes);
    const diff = SEVERITY_ORDER[sa] - SEVERITY_ORDER[sb];
    if (diff !== 0) return diff;
    // Within the same severity, soonest expiry first.
    const da = a.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    const db = b.expiryDate?.toMillis() ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export default function OverviewPage() {
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [allEvents, setAllEvents] = useState<MaintenanceEvent[]>([]);
  const [allDefects, setAllDefects] = useState<Defect[]>([]);

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

  const eventsByTail = useMemo(() => {
    const map = new Map<string, MaintenanceEvent[]>();
    for (const e of allEvents) {
      const arr = map.get(e.tailNumber) ?? [];
      arr.push(e);
      map.set(e.tailNumber, arr);
    }
    return map;
  }, [allEvents]);

  const defectsByTail = useMemo(() => {
    const map = new Map<string, Defect[]>();
    for (const d of allDefects) {
      const arr = map.get(d.tailNumber) ?? [];
      arr.push(d);
      map.set(d.tailNumber, arr);
    }
    return map;
  }, [allDefects]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Maintenance Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Fleet status, grouped by tail number.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" />
          Import flight data
        </Button>
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
        <div className="space-y-4">
          {aircraft.map((a) => (
            <AircraftCard
              key={a.tailNumber}
              aircraft={a}
              events={sortEvents(
                eventsByTail.get(a.tailNumber) ?? [],
                a.totalTimeMinutes,
              )}
              onOpenEditLog={() => setAuditLogTail(a.tailNumber)}
              onUpdateTtaf={() => setTtafTarget(a)}
              onEditBooked={() => setBookedTarget(a)}
              onAddEvent={() => openAddEvent(a.tailNumber)}
              onEditEvent={openEditEvent}
              onDeleteEvent={setDeleteTarget}
              defects={defectsByTail.get(a.tailNumber) ?? []}
              onAddDefect={() => openAddDefect(a.tailNumber)}
              onEditDefect={openEditDefect}
              onDeleteDefect={setDefectDeleteTarget}
            />
          ))}
        </div>
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
