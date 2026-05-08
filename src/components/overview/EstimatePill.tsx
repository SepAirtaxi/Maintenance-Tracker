import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  estimated: boolean;
  estimatedManHours: number | null;
  readOnly?: boolean;
  onClick?: () => void;
};

export default function EstimatePill({
  estimated,
  estimatedManHours,
  readOnly = false,
  onClick,
}: Props) {
  const label = !estimated
    ? "Not estimated"
    : estimatedManHours != null
      ? `Estimated · ${estimatedManHours} MH`
      : "Estimated";
  const title = !estimated
    ? "Planner has not reviewed this — click to set an estimate"
    : estimatedManHours != null
      ? `Planner estimate: ${estimatedManHours} man hours · click to manage`
      : "Planner has reviewed this — no man-hour estimate yet · click to manage";

  const className = cn(
    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap",
    estimated
      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
      : "border-border bg-muted text-muted-foreground",
  );

  if (readOnly || !onClick) {
    return (
      <span className={className} title={title}>
        <ClipboardList className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(className, "transition-colors hover:brightness-95")}
    >
      <ClipboardList className="h-3 w-3" />
      {label}
    </button>
  );
}
