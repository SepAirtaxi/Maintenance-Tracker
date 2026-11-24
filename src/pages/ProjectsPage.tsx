import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DUE_SOON_DAYS,
  compareProjects,
  formatMoney,
  getDeadline,
  isClosed,
  matchesFilter,
  type ProjectFilter,
} from "@/lib/projectStages";
import { setProjectStage, subscribeProjects } from "@/services/projects";
import ProjectCard from "@/components/projects/ProjectCard";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import {
  DeleteProjectDialog,
  StageTargetDialog,
} from "@/components/projects/ProjectSmallDialogs";
import type { Project, ProjectCurrency } from "@/types";

const FILTERS: { key: ProjectFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "quoting", label: "Quoting" },
  { key: "inwork", label: "In work" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [targeting, setTargeting] = useState<Project | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeProjects(setProjects, (err) =>
        setLoadError(err.message || "Couldn't load projects."),
      ),
    [],
  );

  const all = projects ?? [];

  const summary = useMemo(() => {
    let active = 0;
    let overdue = 0;
    let dueSoon = 0;
    let awaiting = 0;
    const value = new Map<ProjectCurrency, number>();
    for (const p of all) {
      if (isClosed(p.stage)) continue;
      active++;
      if (p.stage === "quoted") awaiting++;
      const d = getDeadline(p);
      if (d.kind === "due") {
        if (d.daysLeft < 0) overdue++;
        else if (d.daysLeft <= DUE_SOON_DAYS) dueSoon++;
      }
      if (p.quoteAmount != null) {
        value.set(p.quoteCurrency, (value.get(p.quoteCurrency) ?? 0) + p.quoteAmount);
      }
    }
    return { active, overdue, dueSoon, awaiting, value };
  }, [all]);

  const counts = useMemo(() => {
    const c = {} as Record<ProjectFilter, number>;
    for (const f of FILTERS) c[f.key] = all.filter((p) => matchesFilter(p.stage, f.key)).length;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((p) => matchesFilter(p.stage, filter))
      .filter(
        (p) =>
          !q ||
          [p.title, p.tailNumber, p.customer, p.responsible, p.aircraftType, p.quoteNumber, p.workOrderNumber]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
      )
      .sort(compareProjects);
  }, [all, filter, search]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const onChangeStage = async (p: Project, stage: Project["stage"]) => {
    setActionError(null);
    try {
      await setProjectStage(p, stage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't change stage.");
    }
  };

  const valueText =
    summary.value.size === 0
      ? "—"
      : [...summary.value.entries()].map(([c, v]) => formatMoney(v, c)).join(" + ");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            06 / Projects
          </span>
          <span className="h-px w-12 flex-1 bg-foreground/15" />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-medium leading-none tracking-tight">
              Projects
            </h1>
            <p className="text-sm text-muted-foreground">
              Customer projects from RFQ to completion — move each one along with
              the stage drop-down on its card.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </div>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 border border-foreground/20 bg-card sm:grid-cols-5 divide-x divide-foreground/10">
        <Tile label="Active" value={summary.active} />
        <Tile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? "red" : undefined} />
        <Tile
          label={`Due ≤ ${DUE_SOON_DAYS} days`}
          value={summary.dueSoon}
          tone={summary.dueSoon > 0 ? "yellow" : undefined}
        />
        <Tile label="Awaiting customer" value={summary.awaiting} />
        <Tile label="Quoted · active" value={valueText} small />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ProjectFilter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="gap-1.5">
                {f.label}
                <span className="font-mono text-[9px] opacity-70">{counts[f.key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, tail, customer, responsible, WOQ, WO…"
            className="pl-8"
          />
        </div>
      </div>

      {(loadError || actionError) && (
        <p className="border border-sev-red-edge/50 bg-sev-red-bg px-3 py-2 text-sm text-sev-red-fg" role="alert">
          {loadError ?? actionError}
        </p>
      )}

      {/* List */}
      {projects === null && !loadError ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          hasAny={all.length > 0}
          filtered={!!search.trim() || filter !== "all"}
          onNew={openNew}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onChangeStage={(s) => void onChangeStage(p, s)}
              onEdit={() => {
                setEditing(p);
                setFormOpen(true);
              }}
              onDelete={() => setDeleting(p)}
              onSetTarget={() => setTargeting(p)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} project={editing} />
      <StageTargetDialog project={targeting} onClose={() => setTargeting(null)} />
      <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  small = false,
}: {
  label: string;
  value: number | string;
  tone?: "red" | "yellow";
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-4 py-2.5",
        tone === "red" && "bg-sev-red-bg text-sev-red-fg",
        tone === "yellow" && "bg-sev-yellow-bg text-sev-yellow-fg",
      )}
    >
      <span className={cn("label-eyebrow", tone && "text-current opacity-80")}>{label}</span>
      <span
        className={cn(
          "readout font-bold leading-none",
          small ? "truncate text-sm leading-6" : "text-2xl",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  hasAny,
  filtered,
  onNew,
}: {
  hasAny: boolean;
  filtered: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-foreground/25 bg-card/60 px-6 py-12 text-center">
      <FolderKanban className="h-6 w-6 text-muted-foreground" />
      {hasAny && filtered ? (
        <p className="text-sm text-muted-foreground">No projects match this view.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            No projects yet. Add the first one when an RFQ comes in.
          </p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        </>
      )}
    </div>
  );
}
