import { useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  FileText,
  Loader2,
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
import { getAircraft } from "@/services/aircraft";
import {
  FORECAST_SECTION_DISPLAY_ORDER,
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
      setLoaded({ fileName: file.name, unresolved, aircraft, rows, modelKnown });
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse forecast.");
      setStage("error");
    }
  };

  const onPickClick = () => fileInputRef.current?.click();

  return (
    <div className="space-y-6">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-0.5">
          <div className="text-sm font-bold uppercase tracking-wider">
            Work in progress — not ready for use
          </div>
          <div className="text-xs text-amber-900/90">
            The Forecast module is under active development. The parser and
            this UI are a first draft; results have not been verified for
            operational use. Do not rely on this output for planning a work
            order yet.
          </div>
        </div>
      </div>

      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Telescope className="h-5 w-5 text-muted-foreground" />
            Forecast
            <span className="rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              WIP
            </span>
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
  const { unresolved, aircraft, rows, modelKnown, fileName } = loaded;
  const { header } = unresolved;
  const needsReview = rows.filter((r) => r.needsReview).length;

  return (
    <div className="space-y-4">
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
            <span className="text-muted-foreground">Forecast end</span>{" "}
            <span className="font-medium">
              {header.forecastEndDate
                ? format(header.forecastEndDate, "dd.MM.yyyy")
                : "—"}
            </span>
            {header.forecastEndTtafHours != null && (
              <span className="text-muted-foreground">
                {" "}
                @ {formatDecimalHours(header.forecastEndTtafHours)}
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
      </section>

      {FORECAST_SECTION_DISPLAY_ORDER.map((section) => (
        <SectionGroup
          key={section}
          section={section}
          rows={rows.filter((r) => r.section === section)}
        />
      ))}
    </div>
  );
}

function SectionGroup({
  section,
  rows,
}: {
  section: ForecastSection;
  rows: ForecastRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-md border bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <h2 className="text-sm font-semibold">{section}</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "event" : "events"}
        </span>
      </header>
      <ul className="divide-y">
        {rows.map((r, i) => (
          <ForecastRowItem key={`${section}-${i}`} row={r} />
        ))}
      </ul>
    </section>
  );
}

function ForecastRowItem({ row }: { row: ForecastRow }) {
  return (
    <li className="grid grid-cols-12 items-center gap-3 px-3 py-2 text-sm">
      <div className="col-span-5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" title={row.canonicalName}>
            {row.canonicalName}
          </span>
          {row.needsReview && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              needs review
            </span>
          )}
          {row.engineSide && (
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-secondary-foreground">
              {row.engineSide}
            </span>
          )}
          {row.adType && (
            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
          <span className="text-foreground">
            {formatDue(row)}
          </span>
        </div>
        {row.tolerancePct != null && row.tolerancePct > 0 && (
          <div>Tolerance: ±{row.tolerancePct}%</div>
        )}
      </div>
      <div
        className={cn(
          "col-span-3 text-right text-xs",
          isOverdue(row) ? "text-rose-700 font-medium" : "text-muted-foreground",
        )}
      >
        {formatRemaining(row)}
      </div>
      <div className="col-span-1 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
        {bindingAxis(row)}
      </div>
    </li>
  );
}

function formatDue(r: ForecastRow): string {
  const parts: string[] = [];
  if (r.due?.date) parts.push(format(r.due.date, "dd.MM.yyyy"));
  if (r.due?.hours != null) parts.push(`${formatDecimalHours(r.due.hours)}`);
  return parts.length === 0 ? "—" : parts.join(" · ");
}

function formatRemaining(r: ForecastRow): string {
  if (!r.remaining) return "—";
  const parts: string[] = [];
  if (r.remaining.hours != null) parts.push(`${signedHours(r.remaining.hours)} H`);
  if (r.remaining.months != null) parts.push(`${signedNum(r.remaining.months)} M`);
  return parts.length === 0 ? "—" : parts.join(" · ");
}

function bindingAxis(r: ForecastRow): string {
  const h = r.remaining?.hours;
  const m = r.remaining?.months;
  if (h != null && m != null) return h <= m ? "H" : "M";
  if (h != null) return "H";
  if (m != null) return "M";
  return "";
}

function isOverdue(r: ForecastRow): boolean {
  return (
    (r.remaining?.hours != null && r.remaining.hours <= 0) ||
    (r.remaining?.months != null && r.remaining.months <= 0)
  );
}

function signedHours(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function signedNum(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

function formatDecimalHours(hours: number): string {
  return `${hours.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} H`;
}
