// Quick look at what an aircraft has coming up. Upload the ERP "Aircraft
// Status" report and every event lands in one of three columns — flight hours,
// cycles, calendar — by the limit that calls the aircraft in first. The report
// is held in memory and never stored. The one thing that writes is "Create
// event", which raises an ordinary overview event from a row.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { parseComplianceReport } from "@/compliance/parseComplianceReport";
import type { ComplianceReport } from "@/compliance/types";
import {
  buildNextDue,
  isAnchorInspection,
  type NextDueAxis,
  type NextDueItem,
} from "@/compliance/nextDue";
import { ComplianceUpload } from "@/components/statement/ComplianceUpload";
import EventFormDialog, {
  type EventPrefill,
} from "@/components/overview/EventFormDialog";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeEvents } from "@/services/events";
import { normaliseTailNumber } from "@/lib/tails";
import { cn } from "@/lib/utils";
import type { Aircraft, MaintenanceEvent } from "@/types";

function fmtHours(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}
function fmtLeftHours(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1, useGrouping: false });
}
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}.${d.getFullYear()}`;
}
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// The deadline on one axis, as printed on the report.
function deadline(item: NextDueItem, axis: NextDueAxis): string | null {
  const { hours, cycles, calendar } = item.limits;
  if (axis === "hours") return hours ? fmtHours(hours.stop) : null;
  if (axis === "cycles") return cycles ? String(Math.round(cycles.stop)) : null;
  return calendar ? fmtDate(calendar.stop) : null;
}

// "20 FH" / "20 days" / "20 cycles" to go on one axis, or how far past it is.
function leftLabel(item: NextDueItem, axis: NextDueAxis): string {
  const l = item.limits[axis]!;
  const n = Math.abs(l.left);
  const text =
    axis === "hours"
      ? `${fmtLeftHours(n)} FH`
      : axis === "cycles"
        ? plural(Math.round(n), "cycle", "cycles")
        : plural(n, "day", "days");
  return l.overdue ? `${text} over` : text;
}

// Each limit wears its own tint so the eye finds the kind of deadline before
// reading the figure: hours green, calendar blue, cycles orange.
const CHIP: Record<NextDueAxis, { label: string; className: string }> = {
  hours: {
    label: "TTAF",
    className: "border-axis-hours-edge bg-axis-hours-bg text-axis-hours-fg",
  },
  cycles: {
    label: "CYC",
    className: "border-axis-cycles-edge bg-axis-cycles-bg text-axis-cycles-fg",
  },
  calendar: {
    label: "DATE",
    className: "border-axis-date-edge bg-axis-date-bg text-axis-date-fg",
  },
};

// Titles compared loosely — case, spacing and the report's trailing full stop
// don't make two events different.
function titleKey(s: string): string {
  return s.trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase();
}

// What the event dialog starts with for a row: the report's description as the
// title, the hours limit as TTAF expiry and the calendar limit as due date.
// Cycles have no home on an event, so they are only mentioned.
function prefillFor(item: NextDueItem): EventPrefill {
  const { hours, cycles, calendar } = item.limits;
  let hint: string | undefined;
  if (cycles && !hours && !calendar)
    hint = `Due on cycles only (${Math.round(cycles.stop)}). Events track a date or TTAF — enter one to add it.`;
  else if (cycles)
    hint = `The cycles limit (${Math.round(cycles.stop)}) is not carried over — events track date and TTAF only.`;
  return {
    warning: item.record.description.trim().replace(/\.$/, ""),
    expiryDate: calendar?.stop ?? null,
    timerExpiryTimeMinutes: hours ? Math.round(hours.stop * 60) : null,
    hint,
  };
}

const COLUMNS: { axis: NextDueAxis; label: string; empty: string }[] = [
  { axis: "hours", label: "Flight hours", empty: "No events due on hours." },
  { axis: "calendar", label: "Calendar", empty: "No events due on calendar." },
  { axis: "cycles", label: "Cycles", empty: "No events due on cycles." },
];

function Row({
  item,
  onOverview,
  onCreate,
}: {
  item: NextDueItem;
  // An open event with the same title already sits on this aircraft.
  onOverview: boolean;
  // Absent when the report's aircraft isn't in the fleet.
  onCreate?: () => void;
}) {
  // The scheduled inspections everything else is planned around get a navy
  // rail and a tag, so they stand out from the component tasks around them.
  const anchor = isAnchorInspection(item.record.description);

  // One line per limit the event carries — the one that placed it first, the
  // rest in the usual hours → cycles → calendar order.
  const axes = [
    item.axis,
    ...COLUMNS.map((c) => c.axis).filter((a) => a !== item.axis),
  ].filter((a) => item.limits[a] !== undefined);

  return (
    <li
      className={cn(
        "group relative space-y-1.5 border-l-2 px-3 py-2",
        item.overdue
          ? "border-l-sev-red-edge bg-sev-red-bg"
          : anchor
            ? "border-l-primary bg-primary/[0.06]"
            : "border-l-transparent",
      )}
    >
      <p
        className={cn(
          "text-xs leading-snug text-foreground",
          anchor && "font-semibold",
        )}
      >
        {anchor && (
          <span className="mr-2 inline-block bg-primary px-1 py-px align-[1px] text-[9px] font-bold uppercase tracking-spec text-primary-foreground">
            Anchor
          </span>
        )}
        {item.record.description}
        {item.count > 1 && (
          <span
            className="ml-2 text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
            title={`${item.count} identical events fall due here`}
          >
            ×{item.count}
          </span>
        )}
        {onOverview && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-spec text-sev-green-fg"
            title="An open event with this title is already on the overview"
          >
            <Check className="h-3 w-3" />
            On overview
          </span>
        )}
      </p>
      {onCreate && !onOverview && (
        <button
          type="button"
          onClick={onCreate}
          className="absolute right-2 top-1.5 inline-flex items-center gap-1 border border-primary bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-spec text-primary-foreground opacity-0 transition-opacity hover:bg-primary/90 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          Create event
        </button>
      )}
      {axes.map((axis) => {
        const overdue = item.limits[axis]!.overdue;
        return (
          <div key={axis} className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-baseline gap-1.5 border px-1.5 py-px",
                CHIP[axis].className,
              )}
            >
              <span className="w-8 text-[9px] font-bold uppercase tracking-spec">
                {CHIP[axis].label}
              </span>
              <span className="font-mono text-[11px] font-semibold tabular-nums">
                {deadline(item, axis)}
              </span>
            </span>
            <span
              className={cn(
                "ml-auto whitespace-nowrap font-mono text-[11px] tabular-nums",
                overdue
                  ? "font-semibold text-sev-red-fg"
                  : axis === item.axis
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {leftLabel(item, axis)}
            </span>
          </div>
        );
      })}
    </li>
  );
}

function Column({
  label,
  empty,
  items,
  openTitles,
  onCreate,
}: {
  label: string;
  empty: string;
  items: NextDueItem[];
  openTitles: Set<string>;
  onCreate?: (item: NextDueItem) => void;
}) {
  const overdue = items.filter((i) => i.overdue).length;
  return (
    <section className="flex min-w-0 flex-col border border-foreground/15 bg-card">
      <header className="flex items-baseline gap-2 border-b border-foreground/15 px-3 py-2">
        <span className="font-display text-sm font-semibold tracking-tight">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {items.length}
        </span>
        {overdue > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-spec text-sev-red-fg">
            <AlertTriangle className="h-3 w-3" />
            {overdue} overdue
          </span>
        )}
      </header>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-xs italic text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-foreground/10">
          {items.map((item, i) => (
            <Row
              key={i}
              item={item}
              onOverview={openTitles.has(titleKey(item.record.description))}
              onCreate={onCreate && (() => onCreate(item))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function NextDuePage() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [reportName, setReportName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  // The row being turned into an event. Held as state so the dialog keeps the
  // same prefill while it is open.
  const [prefill, setPrefill] = useState<EventPrefill | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => subscribeAircraft(setFleet), []);
  useEffect(() => subscribeEvents(setEvents), []);

  const onReportFile = async (file: File) => {
    setParsing(true);
    setReportError(null);
    try {
      setReport(await parseComplianceReport(file));
      setReportName(file.name);
    } catch (err) {
      setReport(null);
      setReportName(null);
      setReportError(
        err instanceof Error
          ? `Could not read that report — ${err.message}`
          : "Could not read that report.",
      );
    } finally {
      setParsing(false);
    }
  };

  const clearReport = () => {
    setReport(null);
    setReportName(null);
    setReportError(null);
  };

  const columns = useMemo(
    () => (report ? buildNextDue(report.header, report.records) : null),
    [report],
  );

  // Events can only be raised when the report is for one of our aircraft.
  const reportTail = report ? normaliseTailNumber(report.header.tailNumber) : "";
  const tailInFleet =
    reportTail !== "" && fleet.some((a) => a.tailNumber === reportTail);

  const openTitles = useMemo(
    () =>
      new Set(
        events
          .filter((e) => e.tailNumber === reportTail && !e.resolvedAt)
          .map((e) => titleKey(e.warning)),
      ),
    [events, reportTail],
  );

  const startCreate = (item: NextDueItem) => {
    setPrefill(prefillFor(item));
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            05 / Next Due
          </span>
          <span className="h-px flex-1 bg-foreground/15 w-12" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
          Next Due
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload an aircraft status report to see what comes up next. Each event
          sits under the limit that brings the aircraft in first — hours before
          cycles before calendar, unless a limit is already overdue.
        </p>
      </header>

      <ComplianceUpload
        report={report}
        fileName={reportName}
        parsing={parsing}
        error={reportError}
        expectedTail=""
        reportTailInFleet={false}
        onFile={(f) => void onReportFile(f)}
        onClear={clearReport}
        onUseReportTail={() => {}}
      />

      {report && columns && (
        <>
          <p className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            Hours and cycles left as of the report
            {report.header.printedOn && ` (printed ${fmtDate(report.header.printedOn)})`}
            {" · "}days left counted from today
            {reportTail &&
              !tailInFleet &&
              ` · ${reportTail} is not in the fleet, so events can't be created from this report`}
          </p>
          <div className="grid items-start gap-3 lg:grid-cols-3">
            {COLUMNS.map((c) => (
              <Column
                key={c.axis}
                label={c.label}
                empty={c.empty}
                items={columns[c.axis]}
                openTitles={openTitles}
                onCreate={tailInFleet ? startCreate : undefined}
              />
            ))}
          </div>
        </>
      )}

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tailNumber={reportTail}
        event={null}
        prefill={prefill}
      />
    </div>
  );
}
