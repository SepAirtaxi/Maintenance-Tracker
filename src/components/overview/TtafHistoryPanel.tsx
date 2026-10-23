import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fetchTtafReadings, type TtafReading } from "@/services/audit";
import { formatMinutesAsDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

const HISTORY_DAYS = 30;

type Props = {
  tailNumber: string;
  // Day the TTAF should reflect (rollout / reported date). The first reading
  // taken *after* that day is flagged as the suggestion: readings land on the
  // first app load of the day, so they show the TTAF before that day's flying.
  anchorDate: Date | null;
  // What the anchor is, for the hint line — e.g. "rollout", "reported date".
  anchorLabel: string;
  onPick: (minutes: number) => void;
};

// Dated TTAF readings from the last 30 days, newest first, for filling a
// "TTAF at …" field after the fact. Shared by the close-event and defect
// dialogs; the parent owns the open/closed toggle and mounts this when open.
export default function TtafHistoryPanel({
  tailNumber,
  anchorDate,
  anchorLabel,
  onPick,
}: Props) {
  const [readings, setReadings] = useState<TtafReading[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadings(null);
    setError(null);
    fetchTtafReadings(tailNumber, HISTORY_DAYS)
      .then((r) => !cancelled && setReadings(r))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load TTAF history.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [tailNumber]);

  // Newest-first list → the suggestion is the oldest reading on or after the
  // day following the anchor.
  let suggestedId: string | null = null;
  if (readings && anchorDate) {
    const dayAfter = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      anchorDate.getDate() + 1,
    ).getTime();
    for (const r of readings) {
      if (r.at.getTime() >= dayAfter) suggestedId = r.id;
      else break;
    }
  }

  return (
    <div className="border border-foreground/20 bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-foreground/10 px-2.5 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-spec text-foreground/70">
          TTAF history · last {HISTORY_DAYS} days
        </span>
        {anchorDate && (
          <span className="text-[10px] text-muted-foreground">
            {anchorLabel}{" "}
            <span className="font-mono">{format(anchorDate, "dd.MM.yyyy")}</span>
          </span>
        )}
      </div>

      {error ? (
        <p className="px-2.5 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : readings == null ? (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading…</p>
      ) : readings.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          No TTAF readings in the last {HISTORY_DAYS} days.
        </p>
      ) : (
        <ul className="max-h-[220px] overflow-y-auto">
          {readings.map((r) => {
            const suggested = r.id === suggestedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPick(r.minutes)}
                  title={`Use TTAF ${formatMinutesAsDuration(r.minutes)}`}
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto_88px] items-center gap-3 border-b border-foreground/[0.06] border-l-2 px-2.5 py-1.5 text-left text-xs transition-colors last:border-b-0 hover:bg-foreground/[0.04]",
                    suggested
                      ? "border-l-primary bg-primary/[0.05]"
                      : "border-l-transparent",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-foreground/85">
                      {format(r.at, "EEE dd.MM.yyyy HH:mm")}
                    </span>
                    {suggested && (
                      <span className="border border-primary/40 px-1 text-[9px] font-bold uppercase tracking-spec text-primary">
                        Suggested
                      </span>
                    )}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-spec text-muted-foreground">
                    {r.source ?? "—"}
                  </span>
                  <span className="text-right font-mono font-semibold">
                    {formatMinutesAsDuration(r.minutes)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-foreground/10 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        Flightlogger readings are taken at the first app load of the day, so
        each one shows the TTAF before that day's flying.
      </p>
    </div>
  );
}
