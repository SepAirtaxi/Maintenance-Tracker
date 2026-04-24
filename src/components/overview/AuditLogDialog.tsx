import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { subscribeAuditLog, type AuditLogEntry } from "@/services/audit";

type Props = {
  tailNumber: string | null;
  onClose: () => void;
};

const actionColor: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-sky-100 text-sky-700",
  delete: "bg-rose-100 text-rose-700",
};

const entityLabel: Record<string, string> = {
  aircraft: "Aircraft",
  ttaf: "TTAF",
  booking: "Booking",
  event: "Event",
  defect: "Defect",
};

export default function AuditLogDialog({ tailNumber, onClose }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    if (!tailNumber) {
      setEntries(null);
      return;
    }
    setEntries(null);
    const unsub = subscribeAuditLog(tailNumber, setEntries);
    return unsub;
  }, [tailNumber]);

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

        <div className="py-2">
          {entries === null && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {entries !== null && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No entries yet. Changes made from now on will appear here.
            </p>
          )}
          {entries && entries.length > 0 && (
            <div className="divide-y rounded-md border">
              {entries.map((e) => (
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
