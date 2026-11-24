import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlarmClock,
  Check,
  ChevronDown,
  CircleSlash,
  Pencil,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  PIPELINE,
  REJECTED,
  daysInStage,
  formatDaysLeft,
  formatMoney,
  getDeadline,
  stageDef,
  stageIndex,
  type Deadline,
} from "@/lib/projectStages";
import type { Project, ProjectStage } from "@/types";

type Props = {
  project: Project;
  onChangeStage: (stage: ProjectStage) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetTarget: () => void;
};

const STRIPE: Record<string, string> = {
  red: "border-l-sev-red-edge",
  yellow: "border-l-sev-yellow-edge",
  green: "border-l-sev-green-edge",
  none: "border-l-foreground/25",
  closed: "border-l-foreground/40",
  rejected: "border-l-sev-red-edge/50",
};

function stripeFor(p: Project, d: Deadline): string {
  if (p.stage === "rejected") return STRIPE.rejected;
  if (d.kind === "closed") return STRIPE.closed;
  if (d.kind === "none") return STRIPE.none;
  return STRIPE[d.severity];
}

export default function ProjectCard({
  project,
  onChangeStage,
  onEdit,
  onDelete,
  onSetTarget,
}: Props) {
  const deadline = getDeadline(project);
  const subtitle = [project.aircraftType, project.customer]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={cn(
        "border border-foreground/20 border-l-4 bg-card",
        stripeFor(project, deadline),
      )}
    >
      <div className="grid grid-cols-[160px_minmax(0,1fr)]">
        {/* Tail-stamp rail */}
        <div className="tail-stamp flex flex-col">
          <div className="border-b border-background/15 px-3 pt-2 pb-1">
            <span className="text-[8px] font-semibold uppercase tracking-spec text-background/70">
              Registration
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center px-3 py-2">
            <span className="font-mono text-[24px] font-bold leading-none tracking-stamp">
              {project.tailNumber}
            </span>
          </div>
          <div className="border-t border-background/15 px-3 py-1 font-mono text-[9px] uppercase tracking-spec text-background/80">
            Opened {formatDate(project.openedDate)}
          </div>
        </div>

        <div className="min-w-0">
          {/* Identity row */}
          <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-2 min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h3
                className="min-w-0 truncate font-display text-lg font-medium leading-tight tracking-tight"
                title={project.title}
              >
                {project.title}
              </h3>
              {subtitle && (
                <span className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Responsible name={project.responsible} onEdit={onEdit} />
              <StageMenu stage={project.stage} onSelect={onChangeStage} />
              <div className="inline-flex items-stretch border border-foreground/20 divide-x divide-foreground/15 bg-card">
                <IconBtn title="Edit project" onClick={onEdit}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </IconBtn>
                <IconBtn title="Delete project" onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              </div>
            </div>
          </div>

          {/* Progress */}
          <ProgressBar project={project} />

          {/* Facts strip */}
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] divide-x divide-foreground/10 border-t border-foreground/10">
            <Fact label="Quote">
              {project.quoteAmount != null ? (
                <span className="readout text-sm font-bold">
                  {formatMoney(project.quoteAmount, project.quoteCurrency)}
                </span>
              ) : (
                <Muted>not quoted</Muted>
              )}
              {project.quoteDate && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatDate(project.quoteDate)}
                </span>
              )}
            </Fact>
            <Fact label="WOQ / WO">
              {project.quoteNumber || project.workOrderNumber ? (
                <span className="truncate font-mono text-xs">
                  {project.quoteNumber ?? "—"}
                  <span className="text-foreground/30"> | </span>
                  {project.workOrderNumber ?? "—"}
                </span>
              ) : (
                <Muted>none yet</Muted>
              )}
            </Fact>
            <Fact label="In stage">
              <span className="readout text-sm font-bold">
                {daysInStage(project)}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
                days
              </span>
            </Fact>
            <TargetCell
              deadline={deadline}
              stage={project.stage}
              onClick={onSetTarget}
            />
          </div>
        </div>
      </div>

      {project.notes && (
        <div className="flex items-stretch border-t border-foreground/10 bg-foreground/[0.03]">
          <div className="flex items-center gap-1.5 border-r border-foreground/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-spec text-foreground/70">
            <StickyNote className="h-3 w-3" />
            Note
          </div>
          <p className="flex-1 whitespace-pre-line px-3 py-1.5 text-xs text-foreground/85">
            {project.notes}
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Progress bar ────────────────────────────────────────────────────────

function ProgressBar({ project }: { project: Project }) {
  const current = stageIndex(project.stage);
  const rejected = project.stage === "rejected";
  // When rejected, the bar stops after "Quote sent" and the rest of the
  // pipeline collapses into one red exit block.
  const shown = rejected ? PIPELINE.slice(0, 2) : PIPELINE;
  const done = project.stage === "completed";

  return (
    <div className="flex items-stretch px-4 pt-2.5 pb-2 gap-[3px]">
      {shown.map((s, i) => {
        const state: "done" | "current" | "todo" = rejected
          ? "done"
          : done || i < current
            ? "done"
            : i === current
              ? "current"
              : "todo";
        const reached = state !== "todo" ? project.stageReachedAt[s.key] : undefined;
        const target = project.stageTargets[s.key];
        const tip = [
          `${String(i + 1).padStart(2, "0")} ${s.label}`,
          reached && `reached ${formatDate(reached)}`,
          target && s.targetLabel && `${s.targetLabel.toLowerCase()} ${formatDate(target)}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div key={s.key} className="min-w-0 flex-1" title={tip}>
            <div
              className={cn(
                "h-1.5",
                state === "done" &&
                  (s.key === "completed" ? "bg-sev-green-edge" : "bg-primary"),
                state === "current" && "bg-accent",
                state === "todo" && "bg-foreground/10",
              )}
            />
            <div className="mt-1 flex items-baseline gap-1 min-w-0">
              <span
                className={cn(
                  "font-mono text-[9px]",
                  state === "todo" ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "truncate text-[10px] uppercase tracking-spec",
                  state === "current"
                    ? "font-bold text-foreground"
                    : state === "done"
                      ? "font-semibold text-foreground/75"
                      : "font-semibold text-muted-foreground/60",
                )}
              >
                {s.short}
              </span>
            </div>
            <div className="h-3 truncate font-mono text-[9px] leading-3 text-muted-foreground tabular-nums">
              {reached
                ? format(reached.toDate(), "dd.MM.yy")
                : state === "todo" && target
                  ? <span className="text-muted-foreground/60">→ {format(target.toDate(), "dd.MM.yy")}</span>
                  : null}
            </div>
          </div>
        );
      })}
      {rejected && (
        <div
          className="min-w-0"
          style={{ flex: PIPELINE.length - 2 }}
          title={`Quote rejected${project.stageReachedAt.rejected ? ` · ${formatDate(project.stageReachedAt.rejected)}` : ""}`}
        >
          <div className="h-1.5 bg-sev-red-edge/70" />
          <div className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-spec text-sev-red-fg">
            <CircleSlash className="h-3 w-3" />
            Quote rejected
          </div>
          <div className="h-3 font-mono text-[9px] leading-3 text-muted-foreground tabular-nums">
            {project.stageReachedAt.rejected &&
              format(project.stageReachedAt.rejected.toDate(), "dd.MM.yy")}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage drop-down ─────────────────────────────────────────────────────

function StageMenu({
  stage,
  onSelect,
}: {
  stage: ProjectStage;
  onSelect: (s: ProjectStage) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const def = stageDef(stage);
  const idx = stageIndex(stage);
  const chipTone =
    stage === "rejected"
      ? "border-sev-red-edge/60 bg-sev-red-bg text-sev-red-fg"
      : stage === "completed"
        ? "border-sev-green-edge/60 bg-sev-green-bg text-sev-green-fg"
        : "border-primary/40 bg-primary/10 text-primary";

  const pick = (s: ProjectStage) => {
    setOpen(false);
    if (s !== stage) onSelect(s);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change stage"
        className={cn(
          "inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-spec transition-colors hover:brightness-95",
          chipTone,
        )}
      >
        {stage !== "rejected" && (
          <span className="font-mono text-[9px] opacity-70">
            {String(idx + 1).padStart(2, "0")}
          </span>
        )}
        {def.label}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1 w-60 border border-foreground/30 bg-card shadow-dialog"
        >
          <div className="border-b border-foreground/10 px-3 py-1.5 label-eyebrow">
            Move to stage
          </div>
          {PIPELINE.map((s, i) => (
            <MenuItem
              key={s.key}
              active={s.key === stage}
              passed={stage !== "rejected" && i < idx}
              code={String(i + 1).padStart(2, "0")}
              label={s.label}
              onClick={() => pick(s.key)}
            />
          ))}
          <div className="border-t border-foreground/15">
            <MenuItem
              active={stage === "rejected"}
              passed={false}
              code="✕"
              label={REJECTED.label}
              danger
              onClick={() => pick("rejected")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  active,
  passed,
  code,
  label,
  danger = false,
  onClick,
}: {
  active: boolean;
  passed: boolean;
  code: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-foreground text-background"
          : danger
            ? "text-sev-red-fg hover:bg-sev-red-bg"
            : "hover:bg-accent/20",
      )}
    >
      <span
        className={cn(
          "w-4 font-mono text-[9px]",
          active ? "text-background/70" : "text-muted-foreground",
        )}
      >
        {code}
      </span>
      <span className={cn("flex-1", passed && !active && "text-foreground/60")}>
        {label}
      </span>
      {(active || passed) && (
        <Check
          className={cn("h-3 w-3", active ? "text-background" : "text-foreground/40")}
        />
      )}
    </button>
  );
}

// ─── Responsible person ──────────────────────────────────────────────────

function Responsible({
  name,
  onEdit,
}: {
  name: string | null;
  onEdit: () => void;
}) {
  // Older projects predate the field — flag them until someone fills it in.
  if (!name) {
    return (
      <button
        type="button"
        onClick={onEdit}
        title="No responsible / contact person yet — click to add one"
        className="mr-1 inline-flex items-center gap-1.5 border border-sev-yellow-edge/60 bg-sev-yellow-bg px-2 py-1 text-[10px] font-bold uppercase tracking-spec text-sev-yellow-fg transition-colors hover:brightness-95"
      >
        <UserRound className="h-3 w-3" />
        Responsible not set
      </button>
    );
  }
  return (
    <span
      className="mr-1 inline-flex max-w-[16rem] items-center gap-1.5 text-xs"
      title={`Responsible / contact: ${name}`}
    >
      <UserRound className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}

// ─── Facts strip cells ───────────────────────────────────────────────────

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 px-3 py-1.5">
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
        {label}
      </span>
      <span className="flex min-w-0 items-baseline gap-2">{children}</span>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] italic text-muted-foreground">{children}</span>;
}

const TARGET_TONE = {
  red: "bg-sev-red-bg text-sev-red-fg hover:bg-sev-red-bg/75",
  yellow: "bg-sev-yellow-bg text-sev-yellow-fg hover:bg-sev-yellow-bg/75",
  green: "bg-sev-green-bg text-sev-green-fg hover:bg-sev-green-bg/75",
};

function TargetCell({
  deadline,
  stage,
  onClick,
}: {
  deadline: Deadline;
  stage: ProjectStage;
  onClick: () => void;
}) {
  if (deadline.kind === "closed") {
    return (
      <div className="flex items-baseline gap-2 px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
          Target
        </span>
        <Muted>{stage === "rejected" ? "closed — rejected" : "closed — completed"}</Muted>
      </div>
    );
  }
  if (deadline.kind === "none") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Set a target: ${stageDef(stage).targetLabel?.toLowerCase() ?? ""}`}
        className="flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-foreground/[0.05]"
      >
        <AlarmClock className="h-3 w-3 text-muted-foreground" />
        <Muted>no target set</Muted>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-spec text-primary">
          Set
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change the target date for this stage"
      className={cn(
        "flex min-w-0 items-center gap-2 px-3 py-1.5 text-left transition-colors",
        TARGET_TONE[deadline.severity],
      )}
    >
      <AlarmClock className="h-3 w-3 shrink-0" />
      <span className="shrink-0 truncate text-[9px] font-bold uppercase tracking-spec opacity-80">
        {deadline.label}
      </span>
      <span className="font-mono text-[11px] tabular-nums">
        {format(deadline.date, "dd.MM.yyyy")}
      </span>
      <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-spec">
        {formatDaysLeft(deadline.daysLeft)}
      </span>
    </button>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-spec text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </button>
  );
}
