import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { formatHoursLeft, formatMinutesAsDuration } from "@/lib/time";
import type { NeedsBookingMatch } from "@/lib/eventStatus";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: NeedsBookingMatch[];
  readOnly: boolean;
  onBook: (tailNumber: string) => void;
};

type Row = NeedsBookingMatch & { sortKey: number };

export default function NeedsBookingDialog({
  open,
  onOpenChange,
  matches,
  readOnly,
  onBook,
}: Props) {
  const rows: Row[] = useMemo(() => {
    // Hours-matches sort by remaining minutes; date-matches by days-as-minutes
    // (24h * 60min) so the two share a comparable urgency axis with hours
    // typically appearing first (smaller numbers).
    const out: Row[] = matches.map((m) => ({
      ...m,
      sortKey: m.reason === "hours" ? m.remaining : m.remaining * 24 * 60,
    }));
    out.sort((a, b) => a.sortKey - b.sortKey);
    return out;
  }, [matches]);

  const handleBook = (tail: string) => {
    onBook(tail);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1100px)] w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle>Needs booking</DialogTitle>
          <DialogDescription>
            Events within 20 flight hours (or 14 days for date-only events) that
            don't have a hangar slot booked yet.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            {rows.length === 0
              ? "No events need booking"
              : `${rows.length} event${rows.length === 1 ? "" : "s"}`}
          </div>
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-xs italic text-muted-foreground">
              Nothing in the booking window right now.
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <RowItem
                  key={r.event.id}
                  match={r}
                  readOnly={readOnly}
                  onBook={() => handleBook(r.event.tailNumber)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowItem({
  match,
  readOnly,
  onBook,
}: {
  match: NeedsBookingMatch;
  readOnly: boolean;
  onBook: () => void;
}) {
  const { event, reason, remaining } = match;
  const primary =
    reason === "hours"
      ? formatMinutesAsDuration(event.timerExpiryTimeMinutes)
      : formatDate(event.expiryDate);
  const metric =
    reason === "hours" ? `${formatHoursLeft(remaining)} hrs` : `${remaining}d`;
  return (
    <div
      className="grid items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30"
      style={{
        gridTemplateColumns: "72px minmax(0,1fr) 96px 96px 80px",
      }}
    >
      <span className="inline-flex items-center justify-center rounded bg-primary text-primary-foreground px-1.5 py-0.5 font-mono text-[11px] font-bold">
        {event.tailNumber}
      </span>
      <span className="truncate" title={event.warning}>
        {event.warning}
        {event.status === "planned" && (
          <span className="ml-1.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider align-middle">
            planned
          </span>
        )}
      </span>
      <span className="font-mono tabular-nums text-[11px] text-muted-foreground justify-self-end">
        {primary}
      </span>
      <span
        className={cn(
          "inline-flex w-full items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums shadow-sm whitespace-nowrap",
          "bg-amber-100 text-amber-900 border-amber-300",
        )}
      >
        {metric}
      </span>
      {readOnly ? (
        <span />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={onBook}
        >
          Book
        </Button>
      )}
    </div>
  );
}
