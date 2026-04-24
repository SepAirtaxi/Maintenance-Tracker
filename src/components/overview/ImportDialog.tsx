import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCsvFile, type CsvParseResult } from "@/lib/csv";
import {
  buildImportPlan,
  executeImport,
  type ImportPlan,
  type ImportSummary,
  type TailDecision,
} from "@/services/import";
import { formatMinutesAsDuration } from "@/lib/time";
import { useAuth } from "@/context/AuthContext";

type Stage = "pick" | "review" | "running" | "done" | "error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ImportDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuth();
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [decisions, setDecisions] = useState<Map<string, TailDecision>>(
    new Map(),
  );
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset when dialog closes
      setStage("pick");
      setError(null);
      setParseResult(null);
      setPlan(null);
      setDecisions(new Map());
      setSummary(null);
    }
  }, [open]);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const pr = await parseCsvFile(file);
      if (pr.rows.length === 0) {
        setError("No valid rows found in the CSV.");
        return;
      }
      const p = await buildImportPlan(pr.rows);
      const initialDecisions = new Map<string, TailDecision>();
      for (const tail of p.unknownTails) {
        initialDecisions.set(tail, { action: "pending" });
      }
      setParseResult(pr);
      setPlan(p);
      setDecisions(initialDecisions);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CSV.");
      setStage("error");
    }
  };

  const unresolvedCount = useMemo(() => {
    if (!plan) return 0;
    return plan.unknownTails.filter(
      (t) => decisions.get(t)?.action === "pending",
    ).length;
  }, [plan, decisions]);

  const onImport = async () => {
    if (!plan || !user || !profile) return;
    setStage("running");
    try {
      const result = await executeImport(plan, decisions, {
        uid: user.uid,
        initials: profile.initials,
      });
      setSummary(result);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStage("error");
    }
  };

  const setDecision = (tail: string, decision: TailDecision) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(tail, decision);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import flight data</DialogTitle>
          <DialogDescription>
            Upload a Flightlogger maintenance warning CSV.
          </DialogDescription>
        </DialogHeader>

        {stage === "pick" && (
          <div className="py-4 space-y-4">
            <label
              htmlFor="csvFile"
              className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose CSV</span>
              <span className="text-xs text-muted-foreground">
                Required columns: call_sign, warning, days_left, log_time_left,
                expiry_date, timer_expiry_time
              </span>
            </label>
            <Input
              id="csvFile"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {stage === "review" && plan && parseResult && (
          <ReviewPane
            plan={plan}
            parseResult={parseResult}
            decisions={decisions}
            onDecision={setDecision}
          />
        )}

        {stage === "running" && (
          <p className="py-6 text-sm text-muted-foreground">Importing…</p>
        )}

        {stage === "done" && summary && <SummaryPane summary={summary} />}

        {stage === "error" && (
          <div className="py-4 space-y-2">
            <p className="text-sm text-destructive">{error ?? "Unknown error."}</p>
          </div>
        )}

        <DialogFooter>
          {stage === "review" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={onImport}
                disabled={unresolvedCount > 0}
                title={
                  unresolvedCount > 0
                    ? `Resolve ${unresolvedCount} unknown tail number(s) first`
                    : undefined
                }
              >
                <Upload className="h-4 w-4" />
                {unresolvedCount > 0
                  ? `Resolve ${unresolvedCount} unknown tail(s)`
                  : "Import"}
              </Button>
            </>
          )}
          {(stage === "done" || stage === "error") && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewPane({
  plan,
  parseResult,
  decisions,
  onDecision,
}: {
  plan: ImportPlan;
  parseResult: CsvParseResult;
  decisions: Map<string, TailDecision>;
  onDecision: (tail: string, decision: TailDecision) => void;
}) {
  const totalRows = [...plan.rowsByTail.values()].reduce(
    (s, arr) => s + arr.length,
    0,
  );

  return (
    <div className="py-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Rows read" value={totalRows} />
        <Stat label="Aircraft touched" value={plan.rowsByTail.size} />
        <Stat label="TTAF updates" value={plan.ttafCandidateByTail.size} />
        <Stat
          label="Unknown tails"
          value={plan.unknownTails.length}
          intent={plan.unknownTails.length > 0 ? "warn" : "ok"}
        />
      </div>

      {plan.ttafCandidateByTail.size > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            TTAF candidates ({plan.ttafCandidateByTail.size})
          </summary>
          <ul className="mt-2 text-xs text-muted-foreground space-y-1">
            {[...plan.ttafCandidateByTail.entries()].map(([tail, mins]) => {
              const stored = plan.existingAircraft.get(tail)?.totalTimeMinutes;
              const willSkip = stored != null && mins < stored;
              return (
                <li key={tail} className="font-mono">
                  {tail}: {formatMinutesAsDuration(mins)}
                  {stored != null && (
                    <>
                      {" "}
                      (stored {formatMinutesAsDuration(stored)}
                      {willSkip ? " — will skip, not newer" : ""})
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {parseResult.invalidRows.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {parseResult.invalidRows.length} invalid row(s) will be skipped
          </div>
          <ul className="mt-1 text-xs space-y-0.5">
            {parseResult.invalidRows.slice(0, 5).map((r) => (
              <li key={r.lineNumber}>
                Line {r.lineNumber}: {r.reason}
              </li>
            ))}
            {parseResult.invalidRows.length > 5 && (
              <li>… and {parseResult.invalidRows.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {plan.unknownTails.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Unknown tail numbers</h3>
          <p className="text-xs text-muted-foreground">
            The CSV references tails not in master data. Dismiss to skip all
            their rows, or create to add them to the fleet.
          </p>
          {plan.unknownTails.map((tail) => (
            <UnknownTailRow
              key={tail}
              tail={tail}
              decision={decisions.get(tail) ?? { action: "pending" }}
              onChange={(d) => onDecision(tail, d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnknownTailRow({
  tail,
  decision,
  onChange,
}: {
  tail: string;
  decision: TailDecision;
  onChange: (d: TailDecision) => void;
}) {
  const [model, setModel] = useState(
    decision.action === "create" ? decision.model : "",
  );

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-medium">{tail}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={decision.action === "dismiss" ? "default" : "outline"}
            onClick={() => onChange({ action: "dismiss" })}
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            variant={decision.action === "create" ? "default" : "outline"}
            onClick={() => onChange({ action: "create", model })}
          >
            Create
          </Button>
        </div>
      </div>
      {decision.action === "create" && (
        <div className="space-y-1">
          <Label htmlFor={`model-${tail}`} className="text-xs">
            Model
          </Label>
          <Input
            id={`model-${tail}`}
            value={model}
            placeholder="e.g. TB-9"
            onChange={(e) => {
              setModel(e.target.value);
              onChange({ action: "create", model: e.target.value });
            }}
          />
        </div>
      )}
    </div>
  );
}

function SummaryPane({ summary }: { summary: ImportSummary }) {
  return (
    <div className="py-4 space-y-3 text-sm">
      <p className="font-medium">Import complete.</p>
      <ul className="space-y-1 text-muted-foreground">
        {summary.createdAircraft.length > 0 && (
          <li>
            Created {summary.createdAircraft.length} aircraft:{" "}
            <span className="font-mono">
              {summary.createdAircraft.join(", ")}
            </span>
          </li>
        )}
        {summary.dismissedTails.length > 0 && (
          <li>
            Dismissed {summary.dismissedTails.length} tail(s):{" "}
            <span className="font-mono">
              {summary.dismissedTails.join(", ")}
            </span>
          </li>
        )}
        <li>Created {summary.createdEvents} new event(s).</li>
        {summary.skippedDuplicateEvents > 0 && (
          <li>
            Skipped {summary.skippedDuplicateEvents} duplicate event(s)
            already in the system.
          </li>
        )}
        {summary.updatedTtaf.length > 0 && (
          <li>
            Updated TTAF on {summary.updatedTtaf.length} aircraft:
            <ul className="mt-1 ml-4 font-mono text-xs">
              {summary.updatedTtaf.map((u) => (
                <li key={u.tailNumber}>
                  {u.tailNumber}:{" "}
                  {u.before == null ? "—" : formatMinutesAsDuration(u.before)}{" "}
                  → {formatMinutesAsDuration(u.after)}
                </li>
              ))}
            </ul>
          </li>
        )}
        {summary.skippedTtafStale.length > 0 && (
          <li>
            Skipped {summary.skippedTtafStale.length} stale TTAF candidate(s)
            (not newer than stored).
          </li>
        )}
        {summary.skippedForUnknownTail > 0 && (
          <li>
            Skipped {summary.skippedForUnknownTail} row(s) for unresolved
            unknown tails.
          </li>
        )}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  intent = "neutral",
}: {
  label: string;
  value: number;
  intent?: "neutral" | "ok" | "warn";
}) {
  const intentClass =
    intent === "warn"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : intent === "ok"
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : "bg-muted/50";
  return (
    <div className={`rounded-md border p-3 ${intentClass}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
