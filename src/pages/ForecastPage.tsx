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
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Telescope className="h-5 w-5 text-muted-foreground" />
            Forecast
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a CAMO Projection List <code>.docx</code> to render an
            opinionated cheat sheet for the next maintenance work order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loaded && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
          <Button onClick={onPickClick} disabled={stage === "parsing"}>
            {stage === "parsing" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
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
        <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">Couldn't parse the file.</div>
            <div className="text-rose-800/90">{error}</div>
          </div>
        </div>
      )}

      {stage === "idle" && !loaded && (
        <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-6 w-6" />
          <div>
            Drop a CAMO Projection List <code>.docx</code> via the upload
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
      <section className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Tail</span>{" "}
            <span className="font-semibold">{header.tailNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Model</span>{" "}
            <span className="font-medium">{aircraft?.model ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Current TTAF</span>{" "}
            <span className="font-medium">
              {consolidation.currentTtafHours != null
                ? formatHours(consolidation.currentTtafHours)
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Today</span>{" "}
            <span className="font-medium">
              {format(consolidation.today, "dd.MM.yyyy")}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Forecast end</span>{" "}
            <span className="font-medium">
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
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {fileName}
          </div>
        </div>
        {!modelKnown && (
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Model <strong>{aircraft?.model}</strong> isn't in the canonical
              event dictionary — every row will show its raw name and a
              needs-review badge.
            </div>
          </div>
        )}
        {modelKnown && needsReview > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
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
            className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
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
        />
      )}

      <DraftWorkOrderPanel rows={consolidation.draftWorkOrder} />

      {consolidation.flaggedForReview.length > 0 && (
        <FlaggedForReviewPanel rows={consolidation.flaggedForReview} />
      )}

      {consolidation.nextCycle.length > 0 && (
        <NextCyclePreview rows={consolidation.nextCycle} />
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
      <section className="rounded-md border-2 border-rose-200 bg-rose-50/50 p-4">
        <div className="text-sm font-semibold text-rose-900">
          No 50 hr anchor found
        </div>
        <div className="text-xs text-rose-800/90 mt-1">
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
    <section className="rounded-md border-2 border-emerald-300 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            Next 50 hr anchor{anchor.is50Plus100 && " · 50 + 100 hr visit"}
          </div>
          <div className="text-base font-semibold text-emerald-950 mt-0.5">
            {anchor.anchorRow.canonicalName}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
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
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-emerald-700/80">
        {label}
      </span>
      <span
        className={cn(
          "font-semibold",
          tone === "rose" ? "text-rose-700" : "text-emerald-950",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---- Lead-time planning panel --------------------------------------------

function LeadTimePlanningPanel({
  rows,
  horizon,
}: {
  rows: ForecastConsolidationRow[];
  horizon: { hoursAhead: number; monthsAhead: number };
}) {
  return (
    <section className="rounded-md border-2 border-sky-200 bg-sky-50/40">
      <header className="flex items-baseline justify-between gap-2 border-b border-sky-200 bg-sky-50 px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <PackageOpen className="h-4 w-4" />
          Lead-time planning — retire &amp; overhaul
        </h2>
        <span className="text-xs text-sky-800/80">
          {rows.length} item{rows.length === 1 ? "" : "s"} · horizon{" "}
          {horizon.hoursAhead} h / {horizon.monthsAhead} mo
        </span>
      </header>
      <div className="px-3 py-2 text-xs text-sky-900/80">
        Components due for retire (<code>Ret</code>) or overhaul (<code>Ove</code>)
        within the lead-time horizon. Order swap units or schedule the overhaul
        slot now — items here are also shown in their natural band panel below,
        so this is a procurement-planning surface, not a re-classification.
      </div>
      <ul className="divide-y border-t border-sky-100">
        {rows.map((r, i) => (
          <ConsolidatedRowItem key={`lead-${i}`} row={r} />
        ))}
      </ul>
    </section>
  );
}

// ---- Draft WO panel -------------------------------------------------------

function DraftWorkOrderPanel({ rows }: { rows: ForecastConsolidationRow[] }) {
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="rounded-md border bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <h2 className="text-sm font-semibold">Draft Work Order</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · greens, ambers, and
          cat-practice auto-includes
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          No items land in the green or amber bands. Check the flagged panel
          below — or the anchor itself may sit at an unusual offset.
        </div>
      ) : (
        FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
          const sectionRows = grouped[section];
          if (!sectionRows || sectionRows.length === 0) return null;
          return (
            <SectionBlock key={section} section={section} count={sectionRows.length}>
              {sectionRows.map((r, i) => (
                <ConsolidatedRowItem key={`${section}-${i}`} row={r} />
              ))}
            </SectionBlock>
          );
        })
      )}
    </section>
  );
}

function FlaggedForReviewPanel({ rows }: { rows: ForecastConsolidationRow[] }) {
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="rounded-md border-2 border-rose-200 bg-rose-50/30">
      <header className="flex items-baseline justify-between gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2">
        <h2 className="text-sm font-semibold text-rose-900">
          Forced but awkward — needs human decision
        </h2>
        <span className="text-xs text-rose-800/80">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="px-3 py-2 text-xs text-rose-900/80">
        Beyond the ±10 h tolerance but inside the next 50 hr cycle. Rule #1
        requires they be addressed before the cycle runs out; the human picks
        whether to pull forward, shift the anchor, or schedule a separate visit.
      </div>
      {FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
        const sectionRows = grouped[section];
        if (!sectionRows || sectionRows.length === 0) return null;
        return (
          <SectionBlock key={section} section={section} count={sectionRows.length}>
            {sectionRows.map((r, i) => (
              <ConsolidatedRowItem key={`${section}-${i}`} row={r} />
            ))}
          </SectionBlock>
        );
      })}
    </section>
  );
}

function NextCyclePreview({ rows }: { rows: ForecastConsolidationRow[] }) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupBySection(rows), [rows]);
  return (
    <section className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Next-cycle preview (defer)
        </span>
        <span className="text-xs text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · beyond anchor + 50 h
        </span>
      </button>
      {open &&
        FORECAST_SECTION_DISPLAY_ORDER.map((section) => {
          const sectionRows = grouped[section];
          if (!sectionRows || sectionRows.length === 0) return null;
          return (
            <SectionBlock key={section} section={section} count={sectionRows.length}>
              {sectionRows.map((r, i) => (
                <ConsolidatedRowItem key={`${section}-${i}`} row={r} muted />
              ))}
            </SectionBlock>
          );
        })}
    </section>
  );
}

function UnclassifiedPanel({ rows }: { rows: ForecastRow[] }) {
  return (
    <section className="rounded-md border bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Unclassified
        </h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} item{rows.length === 1 ? "" : "s"} · no usable deadline
        </span>
      </header>
      <ul className="divide-y">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-12 items-center gap-3 px-3 py-2 text-sm">
            <div className="col-span-8 truncate">
              <span className="font-medium">{r.canonicalName}</span>
              {r.needsReview && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  needs review
                </span>
              )}
            </div>
            <div className="col-span-4 text-right text-xs text-muted-foreground">
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
      <div className="flex items-baseline justify-between gap-2 border-b bg-muted/20 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {section}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {count}
        </span>
      </div>
      <ul className="divide-y">{children}</ul>
    </div>
  );
}

const BAND_STYLES: Record<ForecastBand, string> = {
  green: "bg-emerald-50/40 hover:bg-emerald-50/70",
  amber: "bg-amber-50/60 hover:bg-amber-100/60",
  forced_awkward: "bg-rose-50/40 hover:bg-rose-50/70",
  defer: "bg-card hover:bg-muted/30",
};

const BAND_BADGE: Record<ForecastBand, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  forced_awkward: "bg-rose-100 text-rose-900 border-rose-300",
  defer: "bg-slate-100 text-slate-700 border-slate-300",
};

const BAND_LABEL: Record<ForecastBand, string> = {
  green: "green",
  amber: "amber",
  forced_awkward: "forced",
  defer: "defer",
};

function ConsolidatedRowItem({
  row,
  muted = false,
}: {
  row: ForecastConsolidationRow;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-12 items-center gap-3 px-3 py-2 text-sm",
        BAND_STYLES[row.band],
        muted && "opacity-80",
      )}
    >
      <div className="col-span-6 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate font-medium" title={row.canonicalName}>
            {row.canonicalName}
          </span>
          <BandChip band={row.band} />
          {row.catPracticeAutoInclude && (
            <span className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
              cat practice
            </span>
          )}
          {row.needsReview && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              needs review
            </span>
          )}
          {row.engineSide && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-secondary-foreground">
              {row.engineSide}
            </span>
          )}
          {row.adType && (
            <span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.adType}
            </span>
          )}
        </div>
        {row.adNumberCanonical && (
          <div className="text-xs text-muted-foreground">
            {row.adNumberCanonical}
          </div>
        )}
        {!row.adNumberCanonical && row.section === "Components" && row.serialNo && (
          <div className="text-xs text-muted-foreground">S/N {row.serialNo}</div>
        )}
        {row.section === "Tasks" && row.taskNum && (
          <div className="text-xs text-muted-foreground">
            Task {row.taskNum}
            {row.ataCode ? ` · ATA ${row.ataCode}` : ""}
          </div>
        )}
      </div>
      <div className="col-span-3 text-xs text-muted-foreground">
        <div>
          Due:{" "}
          <span className="text-foreground">{formatDue(row)}</span>
        </div>
        {row.tolerancePct != null && row.tolerancePct > 0 && (
          <div>Tolerance: ±{row.tolerancePct}%</div>
        )}
      </div>
      <div className="col-span-3 text-right text-xs">
        <DirectionBadge direction={row.direction} gapHours={row.gapHours} />
        {row.gapEstimated && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            estimated
          </div>
        )}
      </div>
    </li>
  );
}

function BandChip({ band }: { band: ForecastBand }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
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
        <span className="inline-block rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
          at anchor
        </span>
      );
    case "pulls_forward":
      return (
        <span className="text-foreground">
          pulls forward <span className="font-semibold">{abs} h</span>
        </span>
      );
    case "anchor_moves":
      return (
        <span className="text-amber-800">
          anchor moves earlier <span className="font-semibold">{abs} h</span>
        </span>
      );
    case "needs_earlier_visit":
      return (
        <span className="text-rose-800">
          needs earlier visit (<span className="font-semibold">{abs} h</span>{" "}
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

function formatDue(r: ForecastRow): string {
  const parts: string[] = [];
  if (r.due?.date) parts.push(format(r.due.date, "dd.MM.yyyy"));
  if (r.due?.hours != null) parts.push(`${formatHours(r.due.hours)}`);
  return parts.length === 0 ? "—" : parts.join(" · ");
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} H`;
}
