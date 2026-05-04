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
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  subscribeAuditLog,
  type AuditAction,
  type AuditEntity,
  type AuditLogEntry,
} from "@/services/audit";

type Props = {
  tailNumber: string | null;
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

export default function AuditLogDialog({ tailNumber, onClose }: Props) {
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

  return (
    <Dialog open={tailNumber !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction log — {tailNumber}</DialogTitle>
          <DialogDescription>
            All changes on this aircraft, newest first. Entries cannot be
            edited or deleted.
          </DialogDescription>
        </DialogHeader>

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
            <span className="mr-1 text-xs text-muted-foreground">Entity:</span>
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
            <span className="mr-1 text-xs text-muted-foreground">Action:</span>
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
          {filtered && entries && entries.length > 0 && filtered.length === 0 && (
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
                      <span className="text-sm font-semibold">{g.label}</span>
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
                            <div className="flex-1 min-w-0">{e.summary}</div>
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

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
