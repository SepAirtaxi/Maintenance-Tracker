import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildActualStatementPdf,
  buildStatementPdf,
  type ActualStatementDoc,
  type StatementDoc,
} from "@/lib/statementPdf";
import { subscribeAircraft, normaliseTailNumber } from "@/services/aircraft";
import { useAuth } from "@/context/AuthContext";
import type { Aircraft, UserProfile } from "@/types";

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

// ERP work orders read MX<yy>-<sequence>, e.g. MX26-2 — the sequence is not
// zero-padded. The field takes whatever you type or paste and only uppercases
// it, so an unexpected WO shape still reaches the PDF rather than being
// silently swapped for the blank.
function normalizeWo(v: string): string {
  return v.toUpperCase();
}
// Prefix for the current year, used for the input placeholder and for the
// fill-in-by-hand blank printed when the field is left empty.
function woPrefix(today: Date): string {
  return `MX${String(today.getFullYear() % 100).padStart(2, "0")}`;
}

// ---- DD-MM-YYYY handling for every calendar deadline on the page ----------
// Typed as digits; dashes are inserted for you. Both statements print the
// long-form "Sep 17, 2026".
function maskDmy(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("-");
}
function parseDmy(v: string): Date | null {
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const day = +m[1],
    month = +m[2],
    year = +m[3];
  const d = new Date(year, month - 1, day);
  // Rejects 31-02-2026 and friends — the Date constructor would roll them over.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
    return null;
  return d;
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function isoToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Who the PDF credits as the issuer. Members are held at the profile setup
// gate until they have a display name, so the initials-only fallback should
// only ever show for a profile that hasn't loaded yet.
function issuerLabel(profile: UserProfile | null): string {
  if (!profile) return "—";
  const name = (profile.displayName ?? "").trim();
  return name ? `${name} (${profile.initials})` : profile.initials;
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

function FieldLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    // min-h holds the row at the chip's height, so fields whose "use current"
    // affordance is absent still line up with the ones that have it.
    <span className="mb-1.5 flex min-h-[1.4rem] items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
        {children}
      </span>
      {action}
    </span>
  );
}

// Slim affordance that drops the fleet's current Flightlogger reading into the
// field. Renders nothing when the tail isn't in the fleet or has never synced.
function UseCurrent({
  value,
  label,
  onApply,
}: {
  value: string | null;
  label: string;
  onApply: () => void;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={onApply}
      title={`${label}: ${value}`}
      className="inline-flex items-center gap-1 border border-foreground/20 bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-spec text-secondary-foreground transition-colors hover:border-foreground/60 hover:bg-accent hover:text-accent-foreground"
    >
      <RefreshCw className="h-3 w-3" />
      {label}
      <span className="font-mono tracking-normal">{value}</span>
    </button>
  );
}

// Date entry in DD-MM-YYYY with a picker on the right. The picker is a real
// date input kept off-screen — clicking the icon pops the browser's calendar
// and writes the choice back in DD-MM-YYYY.
function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const parsed = parseDmy(value);

  const openPicker = () => {
    const el = pickerRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  return (
    <div>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(maskDmy(e.target.value))}
          placeholder="DD-MM-YYYY"
          inputMode="numeric"
          spellCheck={false}
          className="pr-9 font-mono"
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label="Pick a date"
          className="absolute right-0 top-0 grid h-9 w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={parsed ? toIso(parsed) : ""}
          onChange={(e) => onChange(isoToDmy(e.target.value))}
          className="pointer-events-none absolute bottom-0 right-3 h-0 w-0 border-0 p-0 opacity-0"
        />
      </div>
      <span className="mt-1 block text-[10px] text-muted-foreground">
        {value === "" ? (
          " "
        ) : parsed ? (
          <>
            Prints as <span className="font-mono">{fmtDate(parsed)}</span>
          </>
        ) : (
          <span className="text-sev-red-fg">Not a valid date</span>
        )}
      </span>
    </div>
  );
}

// A temp-statement "next due" row: a standard-value toggle or a manual
// override, with the computed result shown as an instrument readout on the right.
function DueRow({
  name,
  standardLabel,
  standard,
  onStandardChange,
  computed,
  children,
}: {
  name: string;
  standardLabel: string;
  standard: boolean;
  onStandardChange: (v: boolean) => void;
  computed: string;
  children: React.ReactNode;
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
      {!standard && <div className="mt-3 pl-24">{children}</div>}
    </div>
  );
}

// An actual-statement "next due" row: the event's own name plus its deadline.
// Both halves are free entry — nothing is derived from the aircraft here.
function ActualDueRow({
  name,
  desc,
  onDescChange,
  descPlaceholder,
  deadlineLabel,
  children,
}: {
  name: string;
  desc: string;
  onDescChange: (v: string) => void;
  descPlaceholder: string;
  deadlineLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border border-foreground/15 bg-background p-3">
      <span className="block text-[11px] font-bold uppercase tracking-spec text-foreground">
        {name}
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <FieldLabel>Event</FieldLabel>
          <Input
            value={desc}
            onChange={(e) => onDescChange(e.target.value)}
            placeholder={descPlaceholder}
          />
        </label>
        <div>
          <FieldLabel>{deadlineLabel}</FieldLabel>
          {children}
        </div>
      </div>
    </div>
  );
}

type Variant = "actual" | "temp";

export default function StatementPage() {
  const [variant, setVariant] = useState<Variant>("actual");

  // Shared across both variants — same aircraft, same WO, same readings.
  const [reg, setReg] = useState("OY-CAT");
  const [ttaf, setTtaf] = useState("");
  const [cycles, setCycles] = useState("");
  const [wo, setWo] = useState("");
  const [note, setNote] = useState("");

  // Temp-only: standard-validity toggles and their manual overrides.
  const [hStd, setHStd] = useState(true);
  const [hVal, setHVal] = useState("");
  const [dStd, setDStd] = useState(true);
  const [dVal, setDVal] = useState("");
  const [cStd, setCStd] = useState(true);
  const [cVal, setCVal] = useState("");

  // Actual-only: the three next-due events and their deadlines.
  const [hName, setHName] = useState("");
  const [hDue, setHDue] = useState("");
  const [dName, setDName] = useState("");
  const [dDue, setDDue] = useState("");
  const [cName, setCName] = useState("");
  const [cDue, setCDue] = useState("");

  const [generating, setGenerating] = useState(false);

  const [fleet, setFleet] = useState<Aircraft[]>([]);
  useEffect(() => subscribeAircraft(setFleet), []);

  const { profile } = useAuth();
  const issuedBy = issuerLabel(profile);

  // The fleet record behind whatever is typed in the registration field, if
  // any — the source of the "use current" readings.
  const current = useMemo(() => {
    const tail = normaliseTailNumber(reg);
    return fleet.find((a) => a.tailNumber === tail) ?? null;
  }, [fleet, reg]);
  const currentTtaf =
    current?.totalTimeMinutes != null
      ? fmtHours(current.totalTimeMinutes / 60)
      : null;
  const currentCycles =
    current?.totalLandings != null ? String(current.totalLandings) : null;

  // Default the readings to the fleet's current values whenever the tail
  // changes (and on first load, once the fleet has arrived). Typed edits
  // afterwards stand — the field is only re-filled by the "use current" button.
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!current) {
      filledFor.current = null;
      return;
    }
    if (filledFor.current === current.tailNumber) return;
    filledFor.current = current.tailNumber;
    if (current.totalTimeMinutes != null)
      setTtaf(fmtHours(current.totalTimeMinutes / 60));
    if (current.totalLandings != null) setCycles(String(current.totalLandings));
  }, [current]);

  const regOut = reg.trim().toUpperCase() || "OY-";
  const fileBase = wo.trim() || regOut;

  const tempDoc = useMemo<StatementDoc>(() => {
    const today = new Date();
    const ttafN = parseNum(ttaf);
    const cyclesN = parseNum(cycles);

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
      dueD = parseDmy(dVal);
    }

    // cycles due
    let dueC: string = "—";
    const addC = cStd ? 100 : parseNum(cVal);
    if (cyclesN !== null && addC !== null)
      dueC = String(Math.round(cyclesN) + Math.round(addC));

    return {
      reg: regOut,
      ttaf: ttafN !== null ? fmtHours(ttafN) : "—",
      cycles: cyclesN !== null ? String(Math.round(cyclesN)) : "—",
      printed: fmtDate(today),
      dueH,
      dueD: dueD ? fmtDate(dueD) : "—",
      dueC,
      wo: wo.trim() || `${woPrefix(today)}-____`,
      note,
      issuedBy,
      fileBase,
    };
  }, [
    regOut,
    ttaf,
    cycles,
    wo,
    note,
    hStd,
    hVal,
    dStd,
    dVal,
    cStd,
    cVal,
    issuedBy,
    fileBase,
  ]);

  const actualDoc = useMemo<ActualStatementDoc>(() => {
    const today = new Date();
    const ttafN = parseNum(ttaf);
    const cyclesN = parseNum(cycles);
    const hDueN = parseNum(hDue);
    const cDueN = parseNum(cDue);
    const dDueD = parseDmy(dDue);

    return {
      reg: regOut,
      ttaf: ttafN !== null ? fmtHours(ttafN) : "—",
      cycles: cyclesN !== null ? String(Math.round(cyclesN)) : "—",
      wo: wo.trim() || "—",
      printed: fmtDate(today),
      dueH: {
        desc: hName.trim() || "—",
        value: hDueN !== null ? fmtHours(hDueN) : "—",
      },
      dueD: {
        desc: dName.trim() || "—",
        value: dDueD ? fmtDate(dDueD) : "—",
      },
      dueC: {
        desc: cName.trim() || "—",
        value: cDueN !== null ? String(Math.round(cDueN)) : "—",
      },
      note,
      issuedBy,
      fileBase,
    };
  }, [
    regOut,
    ttaf,
    cycles,
    wo,
    note,
    hName,
    hDue,
    dName,
    dDue,
    cName,
    cDue,
    issuedBy,
    fileBase,
  ]);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      if (variant === "temp") await buildStatementPdf(tempDoc);
      else await buildActualStatementPdf(actualDoc);
    } finally {
      setGenerating(false);
    }
  };

  const fileName =
    variant === "temp" ? `MS ${fileBase} Temp.pdf` : `MS ${fileBase}.pdf`;

  // Shared aircraft block — identical on both variants.
  const aircraftSection = (
    <Section code="01" title="Aircraft">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <FieldLabel>Registration</FieldLabel>
          <Input
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            maxLength={10}
            spellCheck={false}
            list="statement-fleet-tails"
            className="font-mono"
          />
          <datalist id="statement-fleet-tails">
            {fleet.map((a) => (
              <option key={a.tailNumber} value={a.tailNumber}>
                {a.model}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block">
          <FieldLabel>Work order no.</FieldLabel>
          <Input
            value={wo}
            onChange={(e) => setWo(normalizeWo(e.target.value))}
            maxLength={24}
            spellCheck={false}
            placeholder={`${woPrefix(new Date())}-2`}
            className="font-mono"
          />
        </label>
        <label className="block">
          <FieldLabel
            action={
              <UseCurrent
                value={currentTtaf}
                label="Use current"
                onApply={() => setTtaf(currentTtaf ?? "")}
              />
            }
          >
            Current TTAF (hours)
          </FieldLabel>
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
          <FieldLabel
            action={
              <UseCurrent
                value={currentCycles}
                label="Use current"
                onApply={() => setCycles(currentCycles ?? "")}
              />
            }
          >
            Current cycles
          </FieldLabel>
          <Input
            type="number"
            value={cycles}
            onChange={(e) => setCycles(e.target.value)}
            step="1"
            min="0"
            inputMode="numeric"
            placeholder="18193"
            className="font-mono"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {current
          ? "TTAF and cycles are prefilled from the last Flightlogger sync — edit them if the statement needs different readings."
          : `${regOut} isn't in the fleet, so there are no readings to prefill.`}
      </p>
    </Section>
  );

  const noteSection = (
    <Section code="03" title="Note">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Optional free text…"
        className="flex w-full border border-foreground/30 bg-card px-3 py-2 text-sm transition-colors placeholder:italic placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      />
    </Section>
  );

  const footer = (
    <div className="flex flex-col items-start gap-3 border-t border-foreground/15 pt-6">
      <Button size="lg" onClick={onGenerate} disabled={generating}>
        {generating ? "Generating…" : "Generate PDF"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Saves <span className="font-mono">{fileName}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            05 / {variant === "temp" ? "Temporary Statement" : "Maintenance Statement"}
          </span>
          <span className="h-px flex-1 bg-foreground/15 w-12" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
          {variant === "temp"
            ? "Temporary Maintenance Statement"
            : "Maintenance Statement"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {variant === "temp"
            ? "Temporary validity from today's readings — prints the release and signature block. Printed date is set automatically to today."
            : "Actual deadlines and event names, no release or signature block. Printed date is set automatically to today."}
        </p>
      </header>

      <Tabs
        value={variant}
        onValueChange={(v) => setVariant(v as Variant)}
        /* 52.5rem = the old 42rem plus 25% — the next-due rows need the width. */
        className="mx-auto max-w-[52.5rem]"
      >
        <TabsList>
          <TabsTrigger value="actual">Actual statement</TabsTrigger>
          <TabsTrigger value="temp">Temporary statement</TabsTrigger>
        </TabsList>

        <TabsContent
          value="actual"
          className="mt-4 space-y-8 border border-foreground/20 bg-card p-6 sm:p-8"
        >
          {aircraftSection}

          <Section code="02" title="Next Due">
            <div className="space-y-2.5">
              <ActualDueRow
                name="Hours"
                desc={hName}
                onDescChange={setHName}
                descPlaceholder="e.g. 100 h inspection"
                deadlineLabel="Due at TTAF"
              >
                <Input
                  type="number"
                  value={hDue}
                  onChange={(e) => setHDue(e.target.value)}
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="12800.0"
                  className="font-mono"
                />
              </ActualDueRow>
              <ActualDueRow
                name="Calendar"
                desc={dName}
                onDescChange={setDName}
                descPlaceholder="e.g. Annual airworthiness review"
                deadlineLabel="Due date"
              >
                <DateField value={dDue} onChange={setDDue} />
              </ActualDueRow>
              <ActualDueRow
                name="Cycles"
                desc={cName}
                onDescChange={setCName}
                descPlaceholder="e.g. AD 2019-12-05 landing gear"
                deadlineLabel="Due at cycles"
              >
                <Input
                  type="number"
                  value={cDue}
                  onChange={(e) => setCDue(e.target.value)}
                  step="1"
                  min="0"
                  inputMode="numeric"
                  placeholder="18500"
                  className="font-mono"
                />
              </ActualDueRow>
            </div>
            <p className="text-xs text-muted-foreground">
              Rows left blank print as “—”.
            </p>
          </Section>

          {noteSection}
          {footer}
        </TabsContent>

        <TabsContent
          value="temp"
          className="mt-4 space-y-8 border border-foreground/20 bg-card p-6 sm:p-8"
        >
          {aircraftSection}

          <Section code="02" title="Next Due">
            <div className="space-y-2.5">
              <DueRow
                name="Hours"
                standardLabel="+25 h"
                standard={hStd}
                onStandardChange={setHStd}
                computed={tempDoc.dueH}
              >
                <Input
                  type="number"
                  value={hVal}
                  onChange={(e) => setHVal(e.target.value)}
                  placeholder="Hours to add"
                  className="font-mono"
                />
              </DueRow>
              <DueRow
                name="Calendar"
                standardLabel="+30 days"
                standard={dStd}
                onStandardChange={setDStd}
                computed={tempDoc.dueD}
              >
                <DateField value={dVal} onChange={setDVal} />
              </DueRow>
              <DueRow
                name="Cycles"
                standardLabel="+100 cycles"
                standard={cStd}
                onStandardChange={setCStd}
                computed={tempDoc.dueC}
              >
                <Input
                  type="number"
                  value={cVal}
                  onChange={(e) => setCVal(e.target.value)}
                  placeholder="Cycles to add"
                  className="font-mono"
                />
              </DueRow>
            </div>
            <p className="text-xs text-muted-foreground">
              The statement is valid until the first of these is reached.
            </p>
          </Section>

          {noteSection}
          {footer}
        </TabsContent>
      </Tabs>
    </div>
  );
}
