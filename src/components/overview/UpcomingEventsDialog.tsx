import { useMemo } from "react";
import { CalendarDays, Gauge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import {
  computeDaysLeft,
  computeMinutesLeft,
  severityFromDays,
  severityFromMinutes,
  type Severity,
} from "@/lib/eventStatus";
import type { Aircraft, MaintenanceEvent } from "@/types";

const ROW_LIMIT = 25;

const severityPill: Record<Severity, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  yellow: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-rose-200 text-rose-900 border-rose-300 font-semibold",
  unknown: "bg-muted/60 text-muted-foreground border-border",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aircraft: Aircraft[];
  events: MaintenanceEvent[];
};

type ByDateRow = {
  event: MaintenanceEvent;
  daysLeft: number;
  severity: Severity;
};

type ByHoursRow = {
  event: MaintenanceEvent;
  minutesLeft: number;
  severity: Severity;
};

export default function UpcomingEventsDialog({
  open,
  onOpenChange,
  aircraft,
  events,
}: Props) {
  const ttafByTail = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const a of aircraft) m.set(a.tailNumber, a.totalTimeMinutes);
    return m;
  }, [aircraft]);

  const byDate: ByDateRow[] = useMemo(() => {
    const rows: ByDateRow[] = [];
    for (const e of events) {
      const days = computeDaysLeft(e);
      if (days == null) continue;
      rows.push({
        event: e,
        daysLeft: days,
        severity: severityFromDays(days),
      });
    }
    rows.sort((a, b) => a.daysLeft - b.daysLeft);
    return rows.slice(0, ROW_LIMIT);
  }, [events]);

  const byHours: ByHoursRow[] = useMemo(() => {
    const rows: ByHoursRow[] = [];
    for (const e of events) {
      const minutes = computeMinutesLeft(e, ttafByTail.get(e.tailNumber) ?? null);
      if (minutes == null) continue;
      rows.push({
        event: e,
        minutesLeft: minutes,
        severity: severityFromMinutes(minutes),
      });
    }
    rows.sort((a, b) => a.minutesLeft - b.minutesLeft);
    return rows.slice(0, ROW_LIMIT);
  }, [events, ttafByTail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Upcoming events</DialogTitle>
          <DialogDescription>
            Fleet-wide events nearest to expiry. Top {ROW_LIMIT} by each
            dimension.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <Section
            icon={<CalendarDays className="h-4 w-4" />}
            title="By date"
            empty="No events with a due date."
          >
            {byDate.map(({ event, daysLeft, severity }) => (
              <Row
                key={`d-${event.id}`}
                tail={event.tailNumber}
                warning={event.warning}
                planned={event.status === "planned"}
                primary={formatDate(event.expiryDate)}
                metric={daysLeft}
                metricLabel={daysLeft === 1 ? "day" : "days"}
                severity={severity}
              />
            ))}
          </Section>

          <Section
            icon={<Gauge className="h-4 w-4" />}
            title="By hours"
            empty="No events with an hours-based timer."
          >
            {byHours.map(({ event, minutesLeft, severity }) => (
              <Row
                key={`h-${event.id}`}
                tail={event.tailNumber}
                warning={event.warning}
                planned={event.status === "planned"}
                primary={formatMinutesAsDuration(event.timerExpiryTimeMinutes)}
                metric={formatHoursLeft(minutesLeft)}
                metricLabel="hrs"
                severity={severity}
              />
            ))}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren =
    Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {hasChildren ? (
        <div className="divide-y">{children}</div>
      ) : (
        <p className="px-3 py-2 text-xs italic text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Row({
  tail,
  warning,
  planned,
  primary,
  metric,
  metricLabel,
  severity,
}: {
  tail: string;
  warning: string;
  planned: boolean;
  primary: string;
  metric: number | string;
  metricLabel: string;
  severity: Severity;
}) {
  return (
    <div
      className="grid items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30"
      style={{
        gridTemplateColumns: "72px minmax(0,1fr) 88px auto",
      }}
    >
      <span className="inline-flex items-center justify-center rounded bg-foreground text-background px-1.5 py-0.5 font-mono text-[11px] font-bold">
        {tail}
      </span>
      <span className="truncate" title={warning}>
        {warning}
        {planned && (
          <span className="ml-1.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider align-middle">
            planned
          </span>
        )}
      </span>
      <span className="font-mono tabular-nums text-[11px] text-muted-foreground justify-self-start">
        {primary}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums shadow-sm whitespace-nowrap",
          severityPill[severity],
        )}
      >
        {metric} {metricLabel}
      </span>
    </div>
  );
}
