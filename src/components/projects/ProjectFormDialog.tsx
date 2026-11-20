import { FormEvent, useEffect, useState } from "react";
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
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { toIso } from "@/lib/dmy";
import { PIPELINE } from "@/lib/projectStages";
import {
  createProject,
  updateProject,
  type ProjectInput,
} from "@/services/projects";
import type { Project, ProjectCurrency, ProjectStage } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null; // null = create
};

const CURRENCIES: ProjectCurrency[] = ["DKK", "EUR", "USD"];
// Stages that can carry a target ("finish by") date.
const TARGETABLE = PIPELINE.filter((s) => s.targetLabel);

function isoToDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const tsToIso = (ts: { toDate: () => Date } | null | undefined) =>
  ts ? toIso(ts.toDate()) : "";

// Accepts "125000", "125.000", "125 000", "125.000,50", "125000.50".
function parseAmount(raw: string): number | null | "invalid" {
  const s = raw.replace(/\s/g, "").replace(/kr\.?$/i, "");
  if (!s) return null;
  let n: string;
  if (s.includes(",")) n = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, "");
  else n = s;
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : "invalid";
}

export default function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const isEdit = project !== null;
  const [title, setTitle] = useState("");
  const [tail, setTail] = useState("");
  const [aircraftType, setAircraftType] = useState("");
  const [customer, setCustomer] = useState("");
  const [responsible, setResponsible] = useState("");
  const [opened, setOpened] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("DKK");
  const [quoteDate, setQuoteDate] = useState("");
  const [woq, setWoq] = useState("");
  const [wo, setWo] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<ProjectStage>("rfq");
  const [targets, setTargets] = useState<Partial<Record<ProjectStage, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    setTail(project?.tailNumber ?? "");
    setAircraftType(project?.aircraftType ?? "");
    setCustomer(project?.customer ?? "");
    setResponsible(project?.responsible ?? "");
    setOpened(project ? tsToIso(project.openedDate) : toIso(new Date()));
    setAmount(project?.quoteAmount != null ? String(project.quoteAmount) : "");
    setCurrency(project?.quoteCurrency ?? "DKK");
    setQuoteDate(tsToIso(project?.quoteDate));
    setWoq(project?.quoteNumber ?? "");
    setWo(project?.workOrderNumber ?? "");
    setNotes(project?.notes ?? "");
    setStage(project?.stage ?? "rfq");
    const t: Partial<Record<ProjectStage, string>> = {};
    for (const [k, ts] of Object.entries(project?.stageTargets ?? {})) {
      if (ts) t[k as ProjectStage] = tsToIso(ts);
    }
    setTargets(t);
    setError(null);
    setSaving(false);
  }, [open, project]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!responsible.trim()) {
      setError("Responsible / contact person is required.");
      return;
    }
    const openedDate = isoToDate(opened);
    if (!openedDate) {
      setError("Opening date is required.");
      return;
    }
    const parsedAmount = parseAmount(amount);
    if (parsedAmount === "invalid") {
      setError("Quoted cost isn't a number — e.g. 125000 or 125.000,50.");
      return;
    }
    const stageTargets: ProjectInput["stageTargets"] = {};
    for (const [k, iso] of Object.entries(targets)) {
      const d = iso ? isoToDate(iso) : null;
      if (d) stageTargets[k as ProjectStage] = d;
    }
    const input: ProjectInput = {
      title,
      tailNumber: tail,
      customer,
      responsible,
      aircraftType,
      openedDate,
      quoteAmount: parsedAmount,
      quoteCurrency: currency,
      quoteDate: isoToDate(quoteDate),
      quoteNumber: woq,
      workOrderNumber: wo,
      notes,
      stageTargets,
    };
    setSaving(true);
    try {
      if (isEdit && project) await updateProject(project.id, input);
      else await createProject(input, stage);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${project?.title}` : "New project"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Stage is changed from the drop-down on the card."
                : "Only title, tail number, responsible person and opening date are needed now — the rest can be filled in as the project moves along."}
            </DialogDescription>
          </DialogHeader>

          <Section label="Project">
            <Field label="Title" htmlFor="pTitle">
              <Input
                id="pTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. G1000 NXi upgrade"
              />
            </Field>
            <div className="grid grid-cols-[9rem_1fr] gap-3">
              <Field label="Tail number" htmlFor="pTail">
                <Input
                  id="pTail"
                  value={tail}
                  onChange={(e) => setTail(e.target.value.toUpperCase())}
                  required
                  maxLength={10}
                  spellCheck={false}
                  placeholder="OY-ABC"
                  className="font-mono"
                />
              </Field>
              <Field label="Aircraft type (optional)" htmlFor="pType">
                <Input
                  id="pType"
                  value={aircraftType}
                  onChange={(e) => setAircraftType(e.target.value)}
                  placeholder="e.g. PA-34-220T Seneca V"
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_11rem] gap-3">
              <Field label="Customer (optional)" htmlFor="pCustomer">
                <Input
                  id="pCustomer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Company or owner"
                />
              </Field>
              <Field label="Opened (RFQ received)" htmlFor="pOpened">
                <DateInput id="pOpened" value={opened} onChange={setOpened} required />
              </Field>
            </div>
            <Field label="Responsible / contact person" htmlFor="pResponsible">
              <Input
                id="pResponsible"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                required
                autoFocus={isEdit && !project?.responsible}
                placeholder="Name"
              />
            </Field>
            {!isEdit && (
              <Field label="Current stage" htmlFor="pStage">
                <select
                  id="pStage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as ProjectStage)}
                  className="flex h-9 w-full border border-foreground/30 bg-card px-3 text-sm focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {PIPELINE.map((s, i) => (
                    <option key={s.key} value={s.key}>
                      {String(i + 1).padStart(2, "0")} · {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>

          <Section label="Quote">
            <div className="grid grid-cols-[1fr_auto_11rem] items-end gap-3">
              <Field label="Quoted cost" htmlFor="pAmount">
                <Input
                  id="pAmount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 125.000"
                  className="font-mono"
                />
              </Field>
              <div className="inline-flex h-9 items-stretch border border-foreground/30 divide-x divide-foreground/15">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      "px-2.5 font-mono text-[11px] transition-colors",
                      currency === c
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Field label="Quote date" htmlFor="pQuoteDate">
                <DateInput id="pQuoteDate" value={quoteDate} onChange={setQuoteDate} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WOQ number (optional)" htmlFor="pWoq">
                <Input
                  id="pWoq"
                  value={woq}
                  onChange={(e) => setWoq(e.target.value)}
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
              <Field label="WO number (optional)" htmlFor="pWo">
                <Input
                  id="pWo"
                  value={wo}
                  onChange={(e) => setWo(e.target.value)}
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
            </div>
          </Section>

          <Section
            label="Targets"
            hint="Optional. The card counts down to the target of whichever stage the project is in."
          >
            <div className="divide-y divide-foreground/10 border border-foreground/15">
              {TARGETABLE.map((s, i) => (
                <div
                  key={s.key}
                  className={cn(
                    "grid grid-cols-[1.75rem_1fr_11rem] items-center gap-3 px-2.5 py-1.5",
                    s.key === (project?.stage ?? stage) && "bg-accent/10",
                  )}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs">
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-muted-foreground"> — {s.targetLabel?.toLowerCase()}</span>
                  </span>
                  <DateInput
                    value={targets[s.key] ?? ""}
                    onChange={(iso) => setTargets((t) => ({ ...t, [s.key]: iso }))}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Scope, contacts, open questions…"
              className="w-full border border-foreground/30 bg-card px-3 py-2 text-sm placeholder:italic placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </Section>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="label-eyebrow-strong">{label}</span>
        <span className="h-px flex-1 bg-foreground/15" />
      </div>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
