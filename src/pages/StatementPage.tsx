import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildStatementPdf, type StatementDoc } from "@/lib/statementPdf";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtHours(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}
function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Section wrapper — small-caps numbered eyebrow + hairline rule, per the
// Hangar design language.
function Section({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-muted-foreground">
          {code}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-spec text-foreground">
          {title}
        </span>
        <span className="h-px flex-1 bg-foreground/15" />
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
      {children}
    </span>
  );
}

// A "next due" row: a standard-value toggle or a manual override, with the
// computed result shown as an instrument readout on the right.
function DueRow({
  name,
  standardLabel,
  standard,
  onStandardChange,
  manualValue,
  onManualChange,
  manualType,
  manualPlaceholder,
  computed,
}: {
  name: string;
  standardLabel: string;
  standard: boolean;
  onStandardChange: (v: boolean) => void;
  manualValue: string;
  onManualChange: (v: string) => void;
  manualType: "number" | "date";
  manualPlaceholder?: string;
  computed: string;
}) {
  return (
    <div className="border border-foreground/15 bg-background p-3">
      <div className="flex items-center gap-4">
        <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-spec text-foreground">
          {name}
        </span>
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={standard}
            onChange={(e) => onStandardChange(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary"
          />
          <span className="font-mono text-xs text-foreground/80">
            {standardLabel}
          </span>
        </label>
        <span
          className={
            "ml-auto font-mono text-sm font-semibold tabular-nums " +
            (computed === "—" ? "text-muted-foreground/50" : "text-primary")
          }
        >
          {computed}
        </span>
      </div>
      {!standard && (
        <div className="mt-3 pl-24">
          <Input
            type={manualType}
            value={manualValue}
            onChange={(e) => onManualChange(e.target.value)}
            placeholder={manualPlaceholder}
            className="font-mono"
          />
        </div>
      )}
    </div>
  );
}

export default function StatementPage() {
  const [reg, setReg] = useState("OY-CAT");
  const [ttaf, setTtaf] = useState("");
  const [ldgs, setLdgs] = useState("");
  const [wo, setWo] = useState("");
  const [note, setNote] = useState("");

  const [hStd, setHStd] = useState(true);
  const [hVal, setHVal] = useState("");
  const [dStd, setDStd] = useState(true);
  const [dVal, setDVal] = useState("");
  const [cStd, setCStd] = useState(true);
  const [cVal, setCVal] = useState("");

  const [generating, setGenerating] = useState(false);

  const doc = useMemo<StatementDoc>(() => {
    const today = new Date();
    const ttafN = parseNum(ttaf);
    const ldgsN = parseNum(ldgs);

    // hours due
    let dueH: string = "—";
    const addH = hStd ? 25 : parseNum(hVal);
    if (ttafN !== null && addH !== null) dueH = fmtHours(ttafN + addH);

    // calendar due
    let dueD: Date | null = null;
    if (dStd) {
      dueD = new Date(today);
      dueD.setDate(dueD.getDate() + 30);
    } else if (dVal) {
      dueD = new Date(dVal + "T00:00:00");
    }

    // cycles due
    let dueC: string = "—";
    const addC = cStd ? 100 : parseNum(cVal);
    if (ldgsN !== null && addC !== null)
      dueC = String(Math.round(ldgsN) + Math.round(addC));

    const woClean = wo.replace(/\D/g, "");

    return {
      reg: reg.trim().toUpperCase() || "OY-",
      ttaf: ttafN !== null ? fmtHours(ttafN) : "—",
      ldgs: ldgsN !== null ? String(Math.round(ldgsN)) : "—",
      printed: fmtDate(today),
      dueH,
      dueD: dueD ? fmtDate(dueD) : "—",
      dueC,
      wo: woClean.length === 4 ? woClean : "XXXX",
      note,
    };
  }, [reg, ttaf, ldgs, wo, note, hStd, hVal, dStd, dVal, cStd, cVal]);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      await buildStatementPdf(doc);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            05 / Temporary Statement
          </span>
          <span className="h-px flex-1 bg-foreground/15 w-12" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
          Temporary Maintenance Statement
        </h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details and generate the A4 statement PDF. Printed date is
          set automatically to today.
        </p>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 border border-foreground/20 bg-card p-6 sm:p-8">
      <Section code="01" title="Aircraft">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <FieldLabel>Registration</FieldLabel>
            <Input
              value={reg}
              onChange={(e) => setReg(e.target.value.toUpperCase())}
              maxLength={10}
              spellCheck={false}
              className="font-mono"
            />
          </label>
          <label className="block">
            <FieldLabel>Work order no.</FieldLabel>
            <Input
              value={wo}
              onChange={(e) => setWo(e.target.value.replace(/\D/g, ""))}
              maxLength={4}
              inputMode="numeric"
              placeholder="0000"
              className="font-mono"
            />
          </label>
          <label className="block">
            <FieldLabel>TTAF (hours)</FieldLabel>
            <Input
              type="number"
              value={ttaf}
              onChange={(e) => setTtaf(e.target.value)}
              step="0.1"
              min="0"
              inputMode="decimal"
              placeholder="12664.7"
              className="font-mono"
            />
          </label>
          <label className="block">
            <FieldLabel>Landings</FieldLabel>
            <Input
              type="number"
              value={ldgs}
              onChange={(e) => setLdgs(e.target.value)}
              step="1"
              min="0"
              inputMode="numeric"
              placeholder="18193"
              className="font-mono"
            />
          </label>
        </div>
      </Section>

      <Section code="02" title="Validity — Next Due">
        <div className="space-y-2.5">
          <DueRow
            name="Hours"
            standardLabel="+25 h"
            standard={hStd}
            onStandardChange={setHStd}
            manualValue={hVal}
            onManualChange={setHVal}
            manualType="number"
            manualPlaceholder="Hours to add"
            computed={doc.dueH}
          />
          <DueRow
            name="Calendar"
            standardLabel="+30 days"
            standard={dStd}
            onStandardChange={setDStd}
            manualValue={dVal}
            onManualChange={setDVal}
            manualType="date"
            computed={doc.dueD}
          />
          <DueRow
            name="Cycles"
            standardLabel="+100 ldgs"
            standard={cStd}
            onStandardChange={setCStd}
            manualValue={cVal}
            onManualChange={setCVal}
            manualType="number"
            manualPlaceholder="Landings to add"
            computed={doc.dueC}
          />
        </div>
      </Section>

      <Section code="03" title="Note">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Optional free text…"
          className="flex w-full border border-foreground/30 bg-card px-3 py-2 text-sm transition-colors placeholder:italic placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        />
      </Section>

      <div className="flex flex-col items-start gap-3 border-t border-foreground/15 pt-6">
        <Button size="lg" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate PDF"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Saves <span className="font-mono">TEMP MS {doc.reg} {new Date().toISOString().slice(0, 10)}.pdf</span>
        </span>
      </div>
      </div>
    </div>
  );
}
