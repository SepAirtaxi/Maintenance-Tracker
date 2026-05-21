import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  PackageOpen,
  Telescope,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  severityFromDays,
  severityFromMinutes,
  type Severity,
} from "@/lib/eventStatus";
import {
  parseForecastUnresolved,
  resolveRows,
  type UnresolvedParse,
} from "@/forecast/parseForecast";
import { isModelKnown } from "@/forecast/dictionary";
import { consolidateForecast } from "@/forecast/consolidation";
import { getAircraft } from "@/services/aircraft";
import {
  FORECAST_SECTION_DISPLAY_ORDER,
  type ForecastBand,
  type ForecastConsolidation,
  type ForecastConsolidationRow,
  type ForecastDirection,
  type ForecastRow,
  type ForecastSection,
} from "@/forecast/types";
import type { Aircraft } from "@/types";

type Stage = "idle" | "parsing" | "ready" | "error";

type LoadedForecast = {
  fileName: string;
  unresolved: UnresolvedParse;
  aircraft: Aircraft | null;
  rows: ForecastRow[];
  consolidation: ForecastConsolidation;
  // Set when the aircraft's model is missing from event_dictionary.json (e.g.
  // the four turboprops not covered by training data). Rows still render with
  // raw names + needs-review badges.
  modelKnown: boolean;
};

export default function ForecastPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedForecast | null>(null);

  const reset = () => {
    setStage("idle");
    setError(null);
    setLoaded(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setStage("parsing");
    setError(null);
    setLoaded(null);
    try {
      const buf = await file.arrayBuffer();
      const unresolved = await parseForecastUnresolved(buf);
      const tail = unresolved.header.tailNumber;
      if (!tail) {
        throw new Error(
          "Couldn't read the tail number from this file. Is it a CAMO Projection List export?",
        );
      }
      const aircraft = await getAircraft(tail);
      if (!aircraft) {
        throw new Error(
          `Tail ${tail} isn't in Maintenance Tracker. Add it under Settings → Aircraft first.`,
        );
      }
      const modelKnown = isModelKnown(aircraft.model);
      const rows = resolveRows(unresolved.rawRows, aircraft.model);
      const consolidation = consolidateForecast({
        rows,
        currentTtafMinutes: aircraft.totalTimeMinutes,
        today: new Date(),
        utilizationHoursPerMonth: aircraft.utilizationHoursPerMonth ?? null,
      });
      setLoaded({
        fileName: file.name,
        unresolved,
        aircraft,
        rows,
        consolidation,
        modelKnown,
      });
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse forecast.");
      setStage("error");
    }
  };

  const onPickClick = () => fileInputRef.current?.click();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
              03 / Forecast
            </span>
            <span className="h-px flex-1 bg-foreground/15 w-12" />
          </div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight leading-none">
            <Telescope className="h-5 w-5 text-muted-foreground" />
            Forecast
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a CAMO Projection List <code className="font-mono text-foreground">.docx</code> to render an
            opinionated cheat sheet for the next maintenance work order.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {loaded && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
          <Button onClick={onPickClick} disabled={stage === "parsing"} size="sm">
            {stage === "parsing" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Parsing…
              </>
            ) : (
              <>
                <Upload className="mr-1 h-3.5 w-3.5" />
                {loaded ? "Upload another" : "Upload forecast"}
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
      </header>

      {stage === "error" && error && (
        <div className="flex items-start gap-3 border border-sev-red-edge/50 bg-sev-red-bg p-3 text-sm text-sev-red-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">Couldn't parse the file.</div>
            <div className="text-sev-red-fg/90">{error}</div>
          </div>
        </div>
      )}

      {stage === "idle" && !loaded && (
        <div className="border border-dashed border-foreground/25 bg-foreground/[0.02] p-10 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-6 w-6" />
          <div>
            Drop a CAMO Projection List <code className="font-mono text-foreground">.docx</code> via the upload
            button to get started.
          </div>
        </div>
      )}

      {loaded && <ForecastResult loaded={loaded} />}
    </div>
  );
}

function ForecastResult({ loaded }: { loaded: LoadedForecast }) {
  const { unresolved, aircraft, rows, consolidation, modelKnown, fileName } =
    loaded;
  const { header } = unresolved;
  const needsReview = rows.filter((r) => r.needsReview).length;

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <section className="border border-foreground/20 bg-card">
        <div className="border-b border-foreground/15 bg-foreground/[0.04] px-3 py-1.5">
          <span className="label-eyebrow-strong">Forecast file</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 p-4 text-sm">
          <Datum label="Tail">
            <span className="font-mono font-bold tracking-stamp">
              {header.tailNumber}
            </span>
          </Datum>
          <Datum label="Model">{aircraft?.model ?? "—"}</Datum>
          <Datum label="Current TTAF">
            <span className="font-mono tabular-nums">
              {consolidation.currentTtafHours != null
                ? formatHours(consolidation.currentTtafHours)
                : "—"}
            </span>
          </Datum>
          <Datum label="Today">
            <span className="font-mono tabular-nums">
              {format(consolidation.today, "dd.MM.yyyy")}
            </span>
          </Datum>
          <Datum label="Forecast end">
            <span className="font-mono tabular-nums">
              {header.forecastEndDate
                ? format(header.forecastEndDate, "dd.MM.yyyy")
                : "—"}
            </span>
            {header.forecastEndTtafHours != null && (
              <span className="text-muted-foreground">
                {" "}
                @ {formatHours(header.forecastEndTtafHours)}
              </span>
            )}
          </Datum>
          <div className="ml-auto font-mono text-xs text-muted-foreground italic">
            {fileName}
          </div>
        </div>
        {!modelKnown && (
          <div className="mx-4 mb-3 flex items-start gap-2 border border-sev-yellow-edge/50 bg-sev-yellow-bg/70 p-2 text-xs text-sev-yellow-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Model <strong>{aircraft?.model}</strong> isn't in the canonical
              event dictionary — every row will show its raw name and a
              needs-review badge.
            </div>
          </div>
        )}
        {modelKnown && needsReview > 0 && (
          <div className="mx-4 mb-3 flex items-start gap-2 border border-sev-yellow-edge/50 bg-sev-yellow-bg/70 p-2 text-xs text-sev-yellow-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              {needsReview} row{needsReview === 1 ? "" : "s"} couldn't be
              matched to the dictionary — shown with raw names below.
            </div>
          </div>
        )}
        {consolidation.warnings.map((w, i) => (
          <div
            key={i}
            className="mx-4 mb-3 flex items-start gap-2 border border-sev-yellow-edge/50 bg-sev-yellow-bg/70 p-2 text-xs text-sev-yellow-fg"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>{w}</div>
          </div>
        ))}
      </section>

      <AnchorCard consolidation={consolidation} />

      {consolidation.leadTimePlanning.length > 0 && (
        <LeadTimePlanningPanel
          rows={consolidation.leadTimePlanning}
          horizon={consolidation.leadTimeHorizon}
          today={consolidation.today}
          currentTtafHours={consolidation.currentTtafHours}
        />
      )}

      <DraftWorkOrderPanel
        rows={consolidation.draftWorkOrder}
        today={consolidation.today}
        currentTtafHours={consolidation.currentTtafHours}
      />

      {consolidation.flaggedForReview.length > 0 && (
        <FlaggedForReviewPanel
          rows={consolidation.flaggedForReview}
          today={consolidation.today}
          currentTtafHours={consolidation.currentTtafHours}
        />
      )}

      {consolidation.nextCycle.length > 0 && (
        <NextCyclePreview
          rows={consolidation.nextCycle}
          today={consolidation.today}
          currentTtafHours={consolidation.currentTtafHours}
        />
      )}

      {consolidation.unclassified.length > 0 && (
        <UnclassifiedPanel rows={consolidation.unclassified} />
      )}
    </div>
  );
}

// ---- Anchor card ----------------------------------------------------------

function AnchorCard({ consolidation }: { consolidation: ForecastConsolidation }) {
  const { anchor } = consolidation;
  if (!anchor.anchorRow) {
    return (
      <section className="border border-sev-red-edge/60 bg-sev-red-bg/40 p-4">
        <div className="label-eyebrow-strong text-sev-red-fg">
          No 50 hr anchor found
        </div>
        <div className="text-xs text-sev-red-fg/85 mt-1">
          This forecast didn't contain a 50 hr inspection row. Without an
          anchor the consolidation can't run — every row is shown below as
          unclassified.
        </div>
      </section>
    );
  }
  const hoursToAnchor = anchor.hoursToAnchor;
  const daysToAnchor = anchor.daysToAnchor;
  return (
    <section className="border border-foreground/25 bg-card border-l-4 border-l-sev-green-edge">
      <div className="border-b border-foreground/15 bg-sev-green-bg/40 px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-spec text-sev-green-fg">
          <span>Next 50 hr anchor</span>
          {anchor.is50Plus100 && (
            <>
              <span className="opacity-50">·</span>
              <span>50 + 100 hr visit</span>
            </>
          )}
        </div>
        <div className="font-display text-lg font-semibold leading-tight mt-1 text-foreground">
          {anchor.anchorRow.canonicalName}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-foreground/15 border-t border-foreground/10">
        <Stat
          label="Due TTAF"
          value={
            anchor.anchorTtafHours != null
              ? formatHours(anchor.anchorTtafHours)
              : "—"
          }
        />
        <Stat
          label="Due date"
          value={anchor.anchorDate ? format(anchor.anchorDate, "dd.MM.yyyy") : "—"}
        />
        <Stat
          label="Hours to anchor"
          value={
            hoursToAnchor != null
              ? `${hoursToAnchor >= 0 ? "+" : ""}${hoursToAnchor.toFixed(1)} h`
              : "—"
          }
          tone={hoursToAnchor != null && hoursToAnchor < 0 ? "rose" : "default"}
        />
        <Stat
          label="Days to anchor"
          value={
            daysToAnchor != null
              ? `${daysToAnchor >= 0 ? "+" : ""}${daysToAnchor} d`
              : "—"
          }
          tone={daysToAnchor != null && daysToAnchor < 0 ? "rose" : "default"}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "rose";
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-base font-bold tabular-nums",
          tone === "rose" ? "text-sev-red-fg" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Datum({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

// ---- Lead-time planning panel --------------------------------------------

function LeadTimePlanningPanel({
  rows,
  horizon,
  today,
  currentTtafHours,
}: {
  rows: ForecastConsolidationRow[];
  horizon: { hoursAhead: number; monthsAhead: number };
  today: Date;
  currentTtafHours: number | null;
}) {
  return (
    <section className="border border-foreground/20 bg-card border-l-4 border-l-accent">
      <header className="flex items-baseline justify-between gap-2 border-b border-foreground/15 bg-accent/15 px-3 py-2">
        <h2 className="flex items-center gap-2 label-eyebrow-strong text-accent-foreground">
          <PackageOpen className="h-3.5 w-3.5" />
          Lead-time planning · retire &amp; overhaul
        </h2>
        <span className="text-[10px] uppercase tracking-spec text-accent-foreground/80">
          {rows.length} item{rows.length === 1 ? "" : "s"} · horizon{" "}
          {horizon.hoursAhead}h / {horizon.monthsAhead}mo
        </span>
      </header>
      <div className="px-3 py-2 text-xs text-foreground/75 border-b border-foreground/10">
        Components due for retire (<code className="font-mono">Ret</code>) or overhaul
        (<code className="font-mono">Ove</code>) within the lead-time horizon.
        Order swap units or schedule the overhaul slot now — items here are also
        shown in their natural band panel below, so this is a procurement-planning
        surface, not a re-classification.
      </div>
      <ColumnHeader />
      <ul className="divide-y divide-foreground/10">
        {rows.map((r, i) => (
          <ConsolidatedRowItem
            key={`lead-${i}`}
            row={r}
            today={today}
            currentTtafHours={currentTtafHours}
          />
        ))}
      </ul>
    </section>
  );
}

// ---- Draft WO panel -------------------------------------------------------

function DraftWorkOrderPanel({
  rows,
  today,
  currentTtafHours,
}: {
  rows: ForecastConsolidationRow[];
  today: Date;
  currentTtafHours: number | null;
}) {
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="border border-foreground/20 bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b border-foreground/15 bg-foreground/[0.04] px-3 py-2">
        <h2 className="label-eyebrow-strong">Draft work order</h2>
        <span className="text-[10px] uppercase tracking-spec text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · greens, ambers, and
          cat-practice auto-includes
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground italic">
          No items land in the green or amber bands. Check the flagged panel
          below — or the anchor itself may sit at an unusual offset.
        </div>
      ) : (
        <>
          <ColumnHeader />
          {FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
            const sectionRows = grouped[section];
            if (!sectionRows || sectionRows.length === 0) return null;
            return (
              <SectionBlock key={section} section={section} count={sectionRows.length}>
                {sectionRows.map((r, i) => (
                  <ConsolidatedRowItem
                    key={`${section}-${i}`}
                    row={r}
                    today={today}
                    currentTtafHours={currentTtafHours}
                  />
                ))}
              </SectionBlock>
            );
          })}
        </>
      )}
    </section>
  );
}

function FlaggedForReviewPanel({
  rows,
  today,
  currentTtafHours,
}: {
  rows: ForecastConsolidationRow[];
  today: Date;
  currentTtafHours: number | null;
}) {
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="border border-foreground/20 border-l-4 border-l-sev-red-edge bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b border-foreground/15 bg-sev-red-bg/40 px-3 py-2">
        <h2 className="label-eyebrow-strong text-sev-red-fg">
          Forced but awkward · needs human decision
        </h2>
        <span className="text-[10px] uppercase tracking-spec text-sev-red-fg/80">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="px-3 py-2 text-xs text-foreground/75 border-b border-foreground/10">
        Beyond the ±10 h tolerance but inside the next 50 hr cycle. Rule #1
        requires they be addressed before the cycle runs out; the human picks
        whether to pull forward, shift the anchor, or schedule a separate visit.
      </div>
      <ColumnHeader />
      {FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
        const sectionRows = grouped[section];
        if (!sectionRows || sectionRows.length === 0) return null;
        return (
          <SectionBlock key={section} section={section} count={sectionRows.length}>
            {sectionRows.map((r, i) => (
              <ConsolidatedRowItem
                key={`${section}-${i}`}
                row={r}
                today={today}
                currentTtafHours={currentTtafHours}
              />
            ))}
          </SectionBlock>
        );
      })}
    </section>
  );
}

function NextCyclePreview({
  rows,
  today,
  currentTtafHours,
}: {
  rows: ForecastConsolidationRow[];
  today: Date;
  currentTtafHours: number | null;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="border border-foreground/20 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 border-b border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-left hover:bg-foreground/[0.06]"
      >
        <span className="flex items-center gap-2 label-eyebrow-strong">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Next-cycle preview (defer)
        </span>
        <span className="text-[10px] uppercase tracking-spec text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · beyond anchor + 50h
        </span>
      </button>
      {open && <ColumnHeader />}
      {open &&
        FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
          const sectionRows = grouped[section];
          if (!sectionRows || sectionRows.length === 0) return null;
          return (
            <SectionBlock key={section} section={section} count={sectionRows.length}>
              {sectionRows.map((r, i) => (
                <ConsolidatedRowItem
                  key={`${section}-${i}`}
                  row={r}
                  today={today}
                  currentTtafHours={currentTtafHours}
                  muted
                />
              ))}
            </SectionBlock>
          );
        })}
    </section>
  );
}

function UnclassifiedPanel({ rows }: { rows: ForecastRow[] }) {
  return (
    <section className="border border-foreground/20 bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b border-foreground/15 bg-foreground/[0.04] px-3 py-2">
        <h2 className="label-eyebrow-strong">Unclassified</h2>
        <span className="text-[10px] uppercase tracking-spec text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · no usable deadline
        </span>
      </header>
      <ul className="divide-y divide-foreground/10">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-12 items-center gap-3 px-3 py-2 text-sm">
            <div className="col-span-8 truncate">
              <span className="font-medium">{r.canonicalName}</span>
              {r.needsReview && (
                <span className="ml-2 border border-sev-yellow-edge/50 bg-sev-yellow-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-sev-yellow-fg">
                  needs review
                </span>
              )}
            </div>
            <div className="col-span-4 text-right text-[10px] uppercase tracking-spec text-muted-foreground">
              {r.section}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Row + section helpers -----------------------------------------------

function SectionBlock({
  section,
  count,
  children,
}: {
  section: ForecastSection;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-t border-foreground/10 bg-foreground/[0.03] px-3 py-1">
        <span className="label-eyebrow-strong">{section}</span>
        <span className="section-rule" />
        <span className="text-[10px] uppercase tracking-spec text-muted-foreground">
          {count}
        </span>
      </div>
      <ul className="divide-y divide-foreground/10">{children}</ul>
    </div>
  );
}

const BAND_STYLES: Record<ForecastBand, string> = {
  green: "bg-sev-green-bg/30 hover:bg-sev-green-bg/50",
  amber: "bg-sev-yellow-bg/40 hover:bg-sev-yellow-bg/60",
  forced_awkward: "bg-sev-red-bg/30 hover:bg-sev-red-bg/50",
  defer: "bg-card hover:bg-foreground/[0.03]",
};

const BAND_BADGE: Record<ForecastBand, string> = {
  green: "border-sev-green-edge/60 bg-sev-green-bg text-sev-green-fg",
  amber: "border-sev-yellow-edge/60 bg-sev-yellow-bg text-sev-yellow-fg",
  forced_awkward: "border-sev-red-edge/60 bg-sev-red-bg text-sev-red-fg",
  defer: "border-foreground/25 bg-foreground/[0.05] text-muted-foreground",
};

const BAND_LABEL: Record<ForecastBand, string> = {
  green: "green",
  amber: "amber",
  forced_awkward: "forced",
  defer: "defer",
};

function ConsolidatedRowItem({
  row,
  today,
  currentTtafHours,
  muted = false,
}: {
  row: ForecastConsolidationRow;
  today: Date;
  currentTtafHours: number | null;
  muted?: boolean;
}) {
  const dDays = daysLeft(row.due?.date, today);
  const dHours = hoursLeft(row.due?.hours, currentTtafHours);
  const daysSev = severityFromDays(dDays);
  const hoursSev = severityFromMinutes(dHours != null ? dHours * 60 : null);
  return (
    <li
      className={cn(
        "grid grid-cols-12 items-center gap-3 px-3 py-2 text-sm",
        BAND_STYLES[row.band],
        muted && "opacity-80",
      )}
    >
      <div className="col-span-5 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="truncate font-medium" title={row.canonicalName}>
            {row.canonicalName}
          </span>
          <BandChip band={row.band} />
          {row.catPracticeAutoInclude && (
            <span className="border border-accent/50 bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-accent-foreground">
              cat practice
            </span>
          )}
          {row.needsReview && (
            <span className="border border-sev-yellow-edge/50 bg-sev-yellow-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-sev-yellow-fg">
              needs review
            </span>
          )}
          {row.engineSide && (
            <span className="border border-foreground/25 bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-foreground">
              {row.engineSide}
            </span>
          )}
          {row.adType && (
            <span className="border border-foreground/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
              {row.adType}
            </span>
          )}
          {row.tolerancePct != null && row.tolerancePct > 0 && (
            <span
              className="border border-foreground/25 bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] font-bold tracking-spec text-muted-foreground"
              title="Tolerance window"
            >
              ±{row.tolerancePct}%
            </span>
          )}
        </div>
        {row.adNumberCanonical && (
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            {row.adNumberCanonical}
          </div>
        )}
        {!row.adNumberCanonical && row.section === "Components" && row.serialNo && (
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            S/N {row.serialNo}
          </div>
        )}
        {row.section === "Tasks" && row.taskNum && (
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            Task {row.taskNum}
            {row.ataCode ? ` · ATA ${row.ataCode}` : ""}
          </div>
        )}
      </div>
      {/* Due on — date | TTAF compartment */}
      <div className="col-span-2 grid grid-cols-2 divide-x divide-foreground/15 border border-foreground/20 bg-card overflow-hidden">
        <span
          className="px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums"
          title="Due date"
        >
          {row.due?.date ? format(row.due.date, "dd.MM.yy") : "—"}
        </span>
        <span
          className="px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums"
          title="Due TTAF (hours)"
        >
          {row.due?.hours != null ? row.due.hours.toFixed(1) : "—"}
        </span>
      </div>
      {/* Time until — days | hours compartment with per-half severity tint */}
      <div className="col-span-2 grid grid-cols-2 divide-x divide-foreground/15 border border-foreground/20 overflow-hidden">
        <span
          className={cn(
            "px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums",
            severityHalf[daysSev],
          )}
          title="Days until due"
        >
          {dDays == null ? "—" : `${dDays > 0 ? "+" : ""}${dDays}d`}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums",
            severityHalf[hoursSev],
          )}
          title="Hours until due (vs current TTAF)"
        >
          {dHours == null
            ? "—"
            : `${dHours > 0 ? "+" : ""}${dHours.toFixed(1)}h`}
        </span>
      </div>
      <div className="col-span-3 text-right text-xs">
        <DirectionBadge direction={row.direction} gapHours={row.gapHours} />
        {row.gapEstimated && (
          <div className="text-[9px] uppercase tracking-spec text-muted-foreground mt-0.5">
            estimated
          </div>
        )}
      </div>
    </li>
  );
}

const severityHalf: Record<Severity, string> = {
  green: "bg-sev-green-bg text-sev-green-fg",
  yellow: "bg-sev-yellow-bg text-sev-yellow-fg",
  red: "bg-sev-red-bg text-sev-red-fg font-semibold",
  unknown: "bg-card text-muted-foreground",
};

function ColumnHeader() {
  return (
    <div className="border-b border-foreground/15 bg-foreground/[0.04]">
      <div className="grid grid-cols-12 items-end gap-3 px-3 pt-1 text-[9px] font-bold uppercase tracking-spec text-muted-foreground/80">
        <div className="col-span-5">Event</div>
        <div className="col-span-2 text-center">Due at</div>
        <div className="col-span-2 text-center">Time left</div>
        <div className="col-span-3 text-right">Status</div>
      </div>
      <div className="grid grid-cols-12 items-center gap-3 px-3 pb-1 text-[8px] uppercase tracking-spec text-muted-foreground/70">
        <div className="col-span-5"></div>
        <div className="col-span-2 grid grid-cols-2 text-center">
          <span>Date</span>
          <span>TTAF</span>
        </div>
        <div className="col-span-2 grid grid-cols-2 text-center">
          <span>Days</span>
          <span>Hours</span>
        </div>
        <div className="col-span-3"></div>
      </div>
    </div>
  );
}

function BandChip({ band }: { band: ForecastBand }) {
  return (
    <span
      className={cn(
        "border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-spec",
        BAND_BADGE[band],
      )}
    >
      {BAND_LABEL[band]}
    </span>
  );
}

function DirectionBadge({
  direction,
  gapHours,
}: {
  direction: ForecastDirection;
  gapHours: number;
}) {
  const abs = Math.abs(gapHours).toFixed(1);
  switch (direction) {
    case "at_anchor":
      return (
        <span className="inline-block border border-sev-green-edge/60 bg-sev-green-bg px-2 py-0.5 text-[9px] font-bold uppercase tracking-spec text-sev-green-fg">
          at anchor
        </span>
      );
    case "pulls_forward":
      return (
        <span className="text-foreground">
          pulls forward <span className="font-mono font-semibold">{abs}h</span>
        </span>
      );
    case "anchor_moves":
      return (
        <span className="text-sev-yellow-fg">
          anchor moves earlier <span className="font-mono font-semibold">{abs}h</span>
        </span>
      );
    case "needs_earlier_visit":
      return (
        <span className="text-sev-red-fg">
          needs earlier visit (<span className="font-mono font-semibold">{abs}h</span>{" "}
          before anchor)
        </span>
      );
  }
}

// ---- Utilities ------------------------------------------------------------

function groupBySection<T extends { section: ForecastSection }>(
  rows: T[],
): Record<ForecastSection, T[]> {
  const out: Record<ForecastSection, T[]> = {
    Inspections: [],
    "AD's": [],
    Components: [],
    Tasks: [],
  };
  for (const r of rows) out[r.section].push(r);
  return out;
}

function daysLeft(due: Date | undefined, today: Date): number | null {
  if (!due) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / msPerDay);
}

function hoursLeft(
  dueHours: number | undefined,
  currentTtafHours: number | null,
): number | null {
  if (dueHours == null || currentTtafHours == null) return null;
  return dueHours - currentTtafHours;
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} H`;
}
