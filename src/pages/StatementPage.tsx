import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildActualStatementPdf,
  buildStatementPdf,
  type ActualStatementDoc,
  type StatementDoc,
} from "@/lib/statementPdf";
import { subscribeAircraft, normaliseTailNumber } from "@/services/aircraft";
import { attachStatement } from "@/services/statements";
import { useAuth } from "@/context/AuthContext";
import type { Aircraft, UserProfile } from "@/types";
import { parseComplianceReport } from "@/compliance/parseComplianceReport";
import type { Candidate, ComplianceReport } from "@/compliance/types";
import { ComplianceUpload } from "@/components/statement/ComplianceUpload";
import {
  CompliancePicker,
  type PickerRow,
} from "@/components/statement/CompliancePicker";

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
function dateToDmy(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}-${d.getFullYear()}`;
}
// Distance from the row above in a picker list. Deliberately coarse — it is
// there so a 50 hr and a 100 hr inspection falling 50 hours apart read as a
// pair at a glance, not to be a precise figure.
function fmtGap(delta: number): string {
  if (delta <= 0) return "";
  return delta < 10 ? `+${delta.toFixed(1)}` : `+${Math.round(delta)}`;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// The work order field is free text — whatever is typed reaches the PDF
// unchanged, no shape enforced and nothing substituted. This is only the
// greyed example shown in the empty box, kept on the current year so it
// doesn't age; it never touches the output.
function woHint(today: Date): string {
  return `MX${String(today.getFullYear() % 100).padStart(2, "0")}-2`;
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

// Every box on this page carries an example of the expected shape. Those
// examples sit a shade fainter than typed input so nothing on an untouched
// form reads as already filled in.
function HintInput({ className, ...props }: InputProps) {
  return (
    <Input
      {...props}
      className={cn("placeholder:text-muted-foreground/50", className)}
    />
  );
}

function FieldLabel({
  children,
  action,
  required,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  required?: boolean;
}) {
  return (
    // min-h holds the row at the chip's height, so fields whose "use current"
    // affordance is absent still line up with the ones that have it.
    <span className="mb-1.5 flex min-h-[1.4rem] items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
        {children}
        {required && <span className="ml-1 text-sev-red-fg">*</span>}
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
        <HintInput
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
  picker,
  children,
}: {
  name: string;
  desc: string;
  onDescChange: (v: string) => void;
  descPlaceholder: string;
  deadlineLabel: string;
  // The candidate list from the uploaded compliance report, when there is one.
  picker?: React.ReactNode;
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
          <HintInput
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
      {picker}
    </div>
  );
}

// The registration picker. Deliberately a closed list: a statement can only be
// issued for an aircraft that is actually on the fleet, which removes the whole
// class of typo'd tails and means the overview link always has somewhere to go.
function TailSelect({
  value,
  onChange,
  fleet,
}: {
  value: string;
  onChange: (tail: string) => void;
  fleet: Aircraft[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex h-9 w-full appearance-none border border-foreground/30 bg-card px-3 py-1 pr-9 text-sm font-mono transition-colors",
          "focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          value === "" && "italic text-muted-foreground/60",
        )}
      >
        <option value="">Select registration…</option>
        {fleet.map((a) => (
          <option key={a.tailNumber} value={a.tailNumber}>
            {a.tailNumber} — {a.model}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

// Whether the generated document also becomes the aircraft's current
// statement on the maintenance overview. On by default: the normal case is
// that a freshly issued statement is the valid one. Unticking is for the test
// prints and insignificant corrections that shouldn't displace what's on file.
function LinkToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title="Make this the statement shown on the aircraft's card in the maintenance overview, replacing any statement already linked there."
      className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-spec text-foreground/80 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground/80"
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
          checked
            ? "border-foreground bg-foreground text-background"
            : "border-foreground/40 bg-card group-hover:border-foreground/70",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      Link to overview
    </button>
  );
}

type Variant = "actual" | "temp";

export default function StatementPage() {
  const [variant, setVariant] = useState<Variant>("actual");

  // Shared across both variants — same aircraft, same WO, same readings.
  const [reg, setReg] = useState("");
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
  // Tick state for "Link to overview" — see LinkToggle. Reset to on whenever
  // the page is opened; a deliberate untick holds for the rest of the visit.
  const [linkToCard, setLinkToCard] = useState(true);
  // Set when the PDF generated fine but filing it against the aircraft
  // didn't. The document is already in the user's downloads at that point, so
  // this reports the linking failure without pretending the whole thing failed.
  const [linkError, setLinkError] = useState<string | null>(null);

  // The uploaded ERP compliance report behind the actual statement's pickers.
  // Held in memory only — nothing about it is stored.
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [reportName, setReportName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const onReportFile = async (file: File) => {
    setParsing(true);
    setReportError(null);
    try {
      const parsed = await parseComplianceReport(file);
      setReport(parsed);
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

  // A report can be for an aircraft outside our fleet, in which case the
  // "switch to this registration" shortcut has nowhere to put the value — the
  // registration field only accepts fleet tails.
  const reportTailInFleet = useMemo(() => {
    const tail = report?.header.tailNumber;
    return !!tail && fleet.some((a) => a.tailNumber === tail);
  }, [report, fleet]);

  const regOut = reg.trim().toUpperCase();
  const woOut = wo.trim();
  // Both are required before anything can be generated, so neither statement
  // can be printed with a placeholder standing in for a real value.
  const ready = regOut !== "" && woOut !== "";
  const fileBase = woOut || regOut;

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
      wo: woOut,
      note,
      issuedBy,
      fileBase,
    };
  }, [
    regOut,
    ttaf,
    cycles,
    woOut,
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
      wo: woOut,
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
    woOut,
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

  // ---- Next Due pickers --------------------------------------------------
  // Each axis turns its candidates into rows carrying the deadline exactly as
  // it would be printed, plus whether the fields above already hold it. The
  // selection is derived rather than stored, so typing over either field simply
  // clears the highlight.
  const hoursRows = (list: Candidate<number>[]): PickerRow<number>[] =>
    list.map((candidate) => ({
      candidate,
      value: fmtHours(candidate.stop),
      selected:
        hName.trim() === candidate.record.description &&
        Math.abs((parseNum(hDue) ?? Number.NaN) - candidate.stop) < 0.005,
    }));

  const dateRows = (list: Candidate<Date>[]): PickerRow<Date>[] =>
    list.map((candidate) => ({
      candidate,
      value: dateToDmy(candidate.stop),
      selected:
        dName.trim() === candidate.record.description &&
        dDue === dateToDmy(candidate.stop),
    }));

  const cyclesRows = (list: Candidate<number>[]): PickerRow<number>[] =>
    list.map((candidate) => ({
      candidate,
      value: String(Math.round(candidate.stop)),
      selected:
        cName.trim() === candidate.record.description &&
        (parseNum(cDue) ?? Number.NaN) === Math.round(candidate.stop),
    }));

  const hoursPicker = report && (
    <CompliancePicker
      rows={hoursRows(report.hours.upcoming)}
      overdue={hoursRows(report.hours.overdue)}
      gapFor={(row, previous) => fmtGap(row.candidate.stop - previous.candidate.stop)}
      emptyLabel="No flight-hour deadlines in this report."
      onPick={(candidate) => {
        setHName(candidate.record.description);
        setHDue(candidate.stop.toFixed(2));
      }}
    />
  );

  const datePicker = report && (
    <CompliancePicker
      rows={dateRows(report.dates.upcoming)}
      overdue={dateRows(report.dates.overdue)}
      gapFor={(row, previous) => {
        const days = daysBetween(row.candidate.stop, previous.candidate.stop);
        return days > 0 ? `+${days}d` : "";
      }}
      emptyLabel="No calendar deadlines in this report."
      onPick={(candidate) => {
        setDName(candidate.record.description);
        setDDue(dateToDmy(candidate.stop));
      }}
    />
  );

  const cyclesPicker = report && (
    <CompliancePicker
      rows={cyclesRows(report.cycles.upcoming)}
      overdue={cyclesRows(report.cycles.overdue)}
      gapFor={(row, previous) => fmtGap(row.candidate.stop - previous.candidate.stop)}
      emptyLabel="No cycle deadlines in this report — most aircraft have none."
      onPick={(candidate) => {
        setCName(candidate.record.description);
        setCDue(String(Math.round(candidate.stop)));
      }}
    />
  );

  const onGenerate = async () => {
    if (!ready) return;
    setGenerating(true);
    setLinkError(null);
    try {
      // The download happens first and unconditionally — the PDF is the point
      // of the page, and a Firestore hiccup must never cost the user their
      // document. Linking is a second, best-effort step on the same bytes.
      const built =
        variant === "temp"
          ? await buildStatementPdf(tempDoc)
          : await buildActualStatementPdf(actualDoc);

      if (!linkToCard || !current) return;
      try {
        await attachStatement({
          tailNumber: current.tailNumber,
          variant,
          workOrder: woOut,
          printed: new Date(),
          issuedBy,
          issuedByUid: profile?.uid ?? "",
          fileName: built.fileName,
          bytes: built.bytes,
        });
      } catch (err) {
        setLinkError(
          err instanceof Error
            ? `The PDF was generated, but linking it to ${current.tailNumber} failed — ${err.message}`
            : `The PDF was generated, but linking it to ${current.tailNumber} failed.`,
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  const fileName =
    variant === "temp" ? `MS ${fileBase} Temp.pdf` : `MS ${fileBase}.pdf`;

  const missingLabel =
    regOut === "" && woOut === ""
      ? "Registration and work order number are"
      : regOut === ""
        ? "A registration is"
        : "A work order number is";

  // Shared aircraft block — identical on both variants.
  const aircraftSection = (
    <Section code="01" title="Aircraft">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <FieldLabel required>Registration</FieldLabel>
          <TailSelect value={reg} onChange={setReg} fleet={fleet} />
        </label>
        <label className="block">
          <FieldLabel required>Work order no.</FieldLabel>
          <HintInput
            value={wo}
            onChange={(e) => setWo(e.target.value)}
            maxLength={24}
            spellCheck={false}
            placeholder={woHint(new Date())}
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
          <HintInput
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
          <HintInput
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
          : regOut
            ? `${regOut} isn't in the fleet, so there are no readings to prefill.`
            : "Type a registration to prefill TTAF and cycles from the last Flightlogger sync."}
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
        className="flex w-full border border-foreground/30 bg-card px-3 py-2 text-sm transition-colors placeholder:italic placeholder:text-muted-foreground/50 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      />
    </Section>
  );

  // Both the button and the link tick sit at the head of the page, opposite
  // the variant tabs, rather than at the foot of the form.
  const actionBar = (
    <div className="ml-auto flex items-center gap-4">
      <LinkToggle
        checked={linkToCard}
        onChange={setLinkToCard}
        disabled={generating}
      />
      <Button
        onClick={onGenerate}
        disabled={generating || !ready}
        className="uppercase tracking-spec text-xs"
      >
        {generating ? "Generating…" : "Generate PDF"}
      </Button>
    </div>
  );

  const hintLine = linkError ? (
    <span className="text-sev-red-fg">{linkError}</span>
  ) : !ready ? (
    <>{missingLabel} required before the statement can be generated.</>
  ) : (
    <>
      Saves <span className="font-mono">{fileName}</span>
      {linkToCard ? (
        <>
          {" "}
          and makes it the current statement on{" "}
          <span className="font-mono">{regOut}</span>
        </>
      ) : (
        <> — the overview keeps whatever statement it already has</>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            03 / {variant === "temp" ? "Temporary Statement" : "Maintenance Statement"}
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
        {/* Head row — variant tabs left, the action that produces the
            document right. Same on both tabs. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <TabsList>
            <TabsTrigger value="actual">Actual statement</TabsTrigger>
            <TabsTrigger value="temp">Temporary statement</TabsTrigger>
          </TabsList>
          {actionBar}
        </div>
        <p className="mt-2 text-xs text-muted-foreground sm:text-right">
          {hintLine}
        </p>

        <TabsContent
          value="actual"
          className="mt-4 space-y-8 border border-foreground/20 bg-card p-6 sm:p-8"
        >
          {aircraftSection}

          <Section code="02" title="Next Due">
            <ComplianceUpload
              report={report}
              fileName={reportName}
              parsing={parsing}
              error={reportError}
              expectedTail={normaliseTailNumber(reg)}
              reportTailInFleet={reportTailInFleet}
              onFile={onReportFile}
              onClear={clearReport}
              onUseReportTail={setReg}
            />
            <div className="space-y-2.5">
              <ActualDueRow
                name="Hours"
                desc={hName}
                onDescChange={setHName}
                descPlaceholder="e.g. 100 h inspection"
                deadlineLabel="Due at TTAF"
                picker={hoursPicker}
              >
                <HintInput
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
                picker={datePicker}
              >
                <DateField value={dDue} onChange={setDDue} />
              </ActualDueRow>
              <ActualDueRow
                name="Cycles"
                desc={cName}
                onDescChange={setCName}
                descPlaceholder="e.g. AD 2019-12-05 landing gear"
                deadlineLabel="Due at cycles"
                picker={cyclesPicker}
              >
                <HintInput
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
              Rows left blank print as “—”. Picking from a list fills both
              fields — edit either afterwards if the deadline needs extending.
            </p>
          </Section>

          {noteSection}
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
                <HintInput
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
                <HintInput
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
