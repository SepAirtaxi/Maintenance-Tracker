import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMinutesAsDuration } from "@/lib/time";
import {
  subscribeAuditLog,
  type AuditAction,
  type AuditEntity,
  type AuditLogEntry,
} from "@/services/audit";
import type { Defect, UserProfile } from "@/types";

type Props = {
  tailNumber: string | null;
  defects: Defect[];
  usersByUid: ReadonlyMap<string, UserProfile>;
  onClose: () => void;
};

const actionColor: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-sky-100 text-sky-700",
  delete: "bg-rose-100 text-rose-700",
};

const ENTITY_OPTIONS: { value: AuditEntity; label: string }[] = [
  { value: "aircraft", label: "Aircraft" },
  { value: "ttaf", label: "TTAF" },
  { value: "booking", label: "Booking" },
  { value: "note", label: "Note" },
  { value: "event", label: "Event" },
  { value: "defect", label: "Defect" },
];

const ACTION_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

const entityLabel: Record<string, string> = {
  aircraft: "Aircraft",
  ttaf: "TTAF",
  booking: "Booking",
  note: "Note",
  event: "Event",
  defect: "Defect",
};

type MonthGroup = {
  key: string;
  label: string;
  entries: AuditLogEntry[];
};

// Bucket entries (already newest-first) into month groups. Entries whose
// server timestamp hasn't landed yet land in a "pending" group at the top so
// the user sees their just-written change without waiting for a round-trip.
function groupByMonth(entries: AuditLogEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const byKey = new Map<string, MonthGroup>();
  for (const e of entries) {
    const key = e.at ? format(e.at.toDate(), "yyyy-MM") : "pending";
    const label =
      key === "pending" ? "Just now" : format(e.at.toDate(), "MMMM yyyy");
    let g = byKey.get(key);
    if (!g) {
      g = { key, label, entries: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

// Current and previous month — the two groups we leave open by default so the
// user lands on what they almost always want to see first.
function defaultOpenKeys(now: Date): Set<string> {
  const current = format(now, "yyyy-MM");
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return new Set([current, format(prev, "yyyy-MM"), "pending"]);
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type DefectGroupKey = "open" | "fixed" | "nff";
type DefectGroup = {
  key: DefectGroupKey;
  label: string;
  emptyCopy: string;
  defects: Defect[];
};

function groupDefects(defects: Defect[]): DefectGroup[] {
  const open: Defect[] = [];
  const fixed: Defect[] = [];
  const nff: Defect[] = [];
  for (const d of defects) {
    if (!d.resolvedAt) open.push(d);
    else if (d.resolutionKind === "nff") nff.push(d);
    else fixed.push(d);
  }
  open.sort((a, b) => b.reportedDate.toMillis() - a.reportedDate.toMillis());
  const byResolved = (a: Defect, b: Defect) =>
    (b.resolvedDate?.toMillis() ?? 0) - (a.resolvedDate?.toMillis() ?? 0);
  fixed.sort(byResolved);
  nff.sort(byResolved);
  return [
    {
      key: "open",
      label: "Open",
      emptyCopy: "No open defects.",
      defects: open,
    },
    {
      key: "fixed",
      label: "Resolved",
      emptyCopy: "No resolved defects.",
      defects: fixed,
    },
    {
      key: "nff",
      label: "Closed NFF",
      emptyCopy: "No NFF closures.",
      defects: nff,
    },
  ];
}

const defectRowStyle: Record<DefectGroupKey, string> = {
  open: "border-border bg-card",
  fixed: "border-emerald-200 bg-emerald-50/60",
  nff: "border-amber-300 bg-amber-50",
};

function DefectRow({
  defect,
  group,
  resolverInitials,
  defectsById,
}: {
  defect: Defect;
  group: DefectGroupKey;
  resolverInitials: string | null;
  defectsById: ReadonlyMap<string, Defect>;
}) {
  const followsUp = defect.relatedDefectIds
    .map((id) => defectsById.get(id))
    .filter((d): d is Defect => Boolean(d));
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs",
        defectRowStyle[group],
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground break-words">
            {defect.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              Reported {formatDate(defect.reportedDate)} · TTAF{" "}
              <span className="font-mono">
                {formatMinutesAsDuration(defect.reportedTtafMinutes)}
              </span>
            </span>
            {defect.workOrderNumber && (
              <span>
                · WO{" "}
                <span className="font-mono">{defect.workOrderNumber}</span>
              </span>
            )}
          </div>
          {followsUp.length > 0 && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Follows up on:{" "}
              {followsUp.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  &quot;{p.title}&quot;
                  {p.resolvedDate && ` (NFF ${formatDate(p.resolvedDate)})`}
                </span>
              ))}
            </div>
          )}
          {defect.resolvedAt && defect.resolvedDate && (
            <div
              className={cn(
                "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]",
                group === "nff" ? "text-amber-900" : "text-emerald-900",
              )}
            >
              <span className="font-medium uppercase tracking-wider">
                {group === "nff" ? "Closed NFF" : "Resolved"}
              </span>
              <span>· {formatDate(defect.resolvedDate)}</span>
              {defect.resolutionWorkOrder && (
                <span>
                  · WO{" "}
                  <span className="font-mono">
                    {defect.resolutionWorkOrder}
                  </span>
                </span>
              )}
              {resolverInitials && (
                <span>
                  · by{" "}
                  <span className="font-mono">{resolverInitials}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DefectsTab({
  defects,
  usersByUid,
}: {
  defects: Defect[];
  usersByUid: ReadonlyMap<string, UserProfile>;
}) {
  const groups = useMemo(() => groupDefects(defects), [defects]);
  const defectsById = useMemo(() => {
    const m = new Map<string, Defect>();
    for (const d of defects) m.set(d.id, d);
    return m;
  }, [defects]);
  const initialsFor = (uid: string | null) =>
    uid ? usersByUid.get(uid)?.initials ?? null : null;

  return (
    <div className="space-y-3 py-1">
      {groups.map((g) => (
        <div key={g.key} className="space-y-1.5">
          <div className="flex items-baseline gap-2 px-0.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {g.label}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {g.defects.length}
            </span>
          </div>
          {g.defects.length === 0 ? (
            <p className="px-0.5 text-[11px] italic text-muted-foreground">
              {g.emptyCopy}
            </p>
          ) : (
            <div className="space-y-1.5">
              {g.defects.map((d) => (
                <DefectRow
                  key={d.id}
                  defect={d}
                  group={g.key}
                  resolverInitials={initialsFor(d.resolvedBy)}
                  defectsById={defectsById}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HistoryDialog({
  tailNumber,
  defects,
  usersByUid,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"activity" | "defects">("activity");
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<Set<AuditEntity>>(new Set());
  const [actionFilter, setActionFilter] = useState<Set<AuditAction>>(new Set());
  // The user's explicit open/closed choices, seeded with current+previous
  // month on each open. Filter-driven auto-expansion is computed on top of
  // this set at render time so it doesn't stick after filters are cleared.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() =>
    defaultOpenKeys(new Date()),
  );

  useEffect(() => {
    if (!tailNumber) {
      setEntries(null);
      return;
    }
    setEntries(null);
    setSearch("");
    setEntityFilter(new Set());
    setActionFilter(new Set());
    setOpenKeys(defaultOpenKeys(new Date()));
    setTab("activity");
    const unsub = subscribeAuditLog(tailNumber, setEntries, { limit: 500 });
    return unsub;
  }, [tailNumber]);

  const toggleEntity = (e: AuditEntity) => {
    setEntityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  };

  const toggleAction = (a: AuditAction) => {
    setActionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (entityFilter.size > 0 && !entityFilter.has(e.entity)) return false;
      if (actionFilter.size > 0 && !actionFilter.has(e.action)) return false;
      if (q) {
        const hay = `${e.summary} ${e.byInitials}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, entityFilter, actionFilter]);

  const filtersActive =
    search.trim().length > 0 ||
    entityFilter.size > 0 ||
    actionFilter.size > 0;

  const groups = useMemo(
    () => (filtered ? groupByMonth(filtered) : []),
    [filtered],
  );

  // While filters are active, auto-expand any month containing matches so the
  // user doesn't have to click through closed months hunting for hits.
  const effectiveOpenKeys = useMemo(() => {
    if (!filtersActive) return openKeys;
    const next = new Set(openKeys);
    for (const g of groups) next.add(g.key);
    return next;
  }, [openKeys, filtersActive, groups]);

  const toggleGroup = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setEntityFilter(new Set());
    setActionFilter(new Set());
  };

  const defectCount = defects.length;

  return (
    <Dialog open={tailNumber !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History — {tailNumber}</DialogTitle>
          <DialogDescription>
            Activity log, defects, and events for this aircraft.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="defects">
              Defects
              {defectCount > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {defectCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity">
            <div className="space-y-2 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search summary or initials…"
                  className="h-8 pl-8 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
                <span className="mr-1 text-xs text-muted-foreground">
                  Entity:
                </span>
                {ENTITY_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={entityFilter.has(opt.value)}
                    onClick={() => toggleEntity(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
                <span className="mr-1 text-xs text-muted-foreground">
                  Action:
                </span>
                {ACTION_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={actionFilter.has(opt.value)}
                    onClick={() => toggleAction(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
                {filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>

              {entries && filtered && (
                <p className="text-xs text-muted-foreground">
                  {filtersActive
                    ? `${filtered.length} of ${entries.length} entries`
                    : `${entries.length} entries`}
                </p>
              )}
            </div>

            <div className="py-1">
              {entries === null && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {entries !== null && entries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No entries yet. Changes made from now on will appear here.
                </p>
              )}
              {filtered &&
                entries &&
                entries.length > 0 &&
                filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No entries match the current filters.
                  </p>
                )}
              {groups.length > 0 && (
                <div className="space-y-2">
                  {groups.map((g) => {
                    const open = effectiveOpenKeys.has(g.key);
                    return (
                      <div
                        key={g.key}
                        className="rounded-md border overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          className="flex w-full items-center gap-2 bg-muted/50 px-3 py-1.5 text-left hover:bg-muted/80 transition-colors"
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-sm font-semibold">
                            {g.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {g.entries.length}{" "}
                            {g.entries.length === 1 ? "entry" : "entries"}
                          </span>
                        </button>
                        {open && (
                          <div className="divide-y">
                            {g.entries.map((e) => (
                              <div
                                key={e.id}
                                className="flex items-start gap-3 p-3 text-sm"
                              >
                                <div className="w-28 shrink-0 text-xs font-mono text-muted-foreground">
                                  {formatDateTime(e.at)}
                                </div>
                                <div className="w-14 shrink-0">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                                      actionColor[e.action] ??
                                      "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {e.action}
                                  </span>
                                </div>
                                <div className="w-20 shrink-0 text-xs text-muted-foreground">
                                  {entityLabel[e.entity] ?? e.entity}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {e.summary}
                                </div>
                                <div className="w-12 shrink-0 font-mono text-xs text-muted-foreground text-right">
                                  {e.byInitials}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="defects">
            <DefectsTab defects={defects} usersByUid={usersByUid} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
