// The candidate list that sits under one Next Due row on the actual statement.
//
// One list per axis — flight hours, calendar, cycles — showing what the
// uploaded compliance report says comes next on that axis, soonest first.
// Clicking a row writes its event name and deadline into the two fields above
// it; both stay editable afterwards, so an extension is still just typed over.
//
// No pick is made automatically. The report is only as good as the compliance
// records behind it, and choosing which event a pilot reads on the statement is
// the CAMO's call.

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { Candidate } from "@/compliance/types";

// How many rows show before the list has to be expanded. Enough to see a
// cluster of events falling together without the page turning into a table.
const VISIBLE = 6;

export type PickerRow<TStop> = {
  candidate: Candidate<TStop>;
  // The deadline as it would be printed.
  value: string;
  selected: boolean;
};

function Row<TStop>({
  row,
  gap,
  onPick,
}: {
  row: PickerRow<TStop>;
  gap: string | null;
  onPick: () => void;
}) {
  const { candidate, value, selected } = row;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={
        "flex w-full items-baseline gap-3 px-2 py-1.5 text-left transition-colors " +
        (selected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-foreground/[0.05]")
      }
    >
      <span className="w-24 shrink-0 font-mono text-xs font-semibold tabular-nums">
        {value}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        {candidate.record.description}
      </span>
      {candidate.count > 1 && (
        <span
          className="shrink-0 text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
          title={`${candidate.count} identical events fall due here`}
        >
          {candidate.count} items
        </span>
      )}
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
        {gap}
      </span>
    </button>
  );
}

export function CompliancePicker<TStop>({
  rows,
  overdue,
  gapFor,
  onPick,
  emptyLabel,
}: {
  rows: PickerRow<TStop>[];
  overdue: PickerRow<TStop>[];
  // Distance from the row above, e.g. "+50" — what makes a 50/100 hr pair
  // readable at a glance. Null on the first row.
  gapFor: (row: PickerRow<TStop>, previous: PickerRow<TStop>) => string;
  onPick: (candidate: Candidate<TStop>) => void;
  emptyLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);

  const shown = expanded ? rows : rows.slice(0, VISIBLE);
  const hidden = rows.length - shown.length;

  return (
    <div className="mt-3 border border-foreground/15 bg-card">
      {overdue.length > 0 && (
        <div className="border-b border-foreground/15">
          <button
            type="button"
            onClick={() => setShowOverdue((v) => !v)}
            className="flex w-full items-center gap-2 bg-sev-red-bg px-2 py-1.5 text-left"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-sev-red-fg" />
            <span className="text-[10px] font-bold uppercase tracking-spec text-sev-red-fg">
              {overdue.length} overdue
            </span>
            <ChevronDown
              className={
                "ml-auto h-3.5 w-3.5 text-sev-red-fg transition-transform " +
                (showOverdue ? "rotate-180" : "")
              }
            />
          </button>
          {showOverdue &&
            overdue.map((row, i) => (
              <Row
                key={`overdue-${i}`}
                row={row}
                gap={null}
                onPick={() => onPick(row.candidate)}
              />
            ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="px-2 py-2 text-xs italic text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        shown.map((row, i) => (
          <Row
            key={i}
            row={row}
            gap={i === 0 ? null : gapFor(row, shown[i - 1])}
            onPick={() => onPick(row.candidate)}
          />
        ))
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-foreground/15 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-spec text-muted-foreground transition-colors hover:text-foreground"
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
