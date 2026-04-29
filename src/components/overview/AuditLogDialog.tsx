import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
  event: "Event",
  defect: "Defect",
};

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

  useEffect(() => {
    if (!tailNumber) {
      setEntries(null);
      return;
    }
    setEntries(null);
    setSearch("");
    setEntityFilter(new Set());
    setActionFilter(new Set());
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
          {filtered && filtered.length > 0 && (
            <div className="divide-y rounded-md border">
              {filtered.map((e) => (
                <div key={e.id} className="flex items-start gap-3 p-3 text-sm">
                  <div className="w-28 shrink-0 text-xs font-mono text-muted-foreground">
                    {formatDateTime(e.at)}
                  </div>
                  <div className="w-14 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        actionColor[e.action] ?? "bg-muted text-muted-foreground"
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

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
