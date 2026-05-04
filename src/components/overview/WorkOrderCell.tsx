import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Props = {
  value: string | null;
  readOnly?: boolean;
  onSave: (next: string | null) => Promise<void>;
  // Defaults to work-order copy. Pass custom strings to reuse for other
  // numbers (e.g. requisition).
  placeholder?: string;
  editTitle?: string;
  emptyAffordance?: string;
};

export default function WorkOrderCell(props: Props) {
  if (props.readOnly) {
    return (
      <span
        className={cn(
          "block font-mono text-xs truncate px-1 py-0.5",
          !props.value && "text-muted-foreground italic",
        )}
        title={props.value ?? undefined}
      >
        {props.value ?? "—"}
      </span>
    );
  }
  return <EditableWorkOrderCell {...props} />;
}

function EditableWorkOrderCell({
  value,
  onSave,
  placeholder = "WO number",
  editTitle = "Click to edit work order number",
  emptyAffordance = "add…",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = async () => {
    const next = draft.trim() || null;
    const current = value ?? null;
    if (next === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
    setError(null);
  };

  if (editing) {
    // Overlay so the input can be wider than the narrow grid column
    // without disturbing neighbouring cells.
    return (
      <div className="relative min-w-0 h-6">
        <div className="absolute left-0 top-0 z-20 flex flex-col rounded-md border bg-card shadow-md p-0.5">
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commit();
                } else if (e.key === "Escape") {
                  cancel();
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement?.tagName !== "BUTTON") {
                    void commit();
                  }
                }, 100);
              }}
              disabled={saving}
              className="h-6 w-24 px-1.5 text-xs font-mono"
              placeholder={placeholder}
            />
            <button
              type="button"
              className="rounded p-0.5 hover:bg-secondary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commit()}
              title="Save"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-secondary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {error && (
            <span className="px-1 text-[10px] text-destructive">{error}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left min-w-0 group rounded px-1 py-0.5 hover:bg-secondary"
      title={editTitle}
    >
      <span
        className={cn(
          "block font-mono text-xs truncate group-hover:underline",
          !value && "text-muted-foreground italic",
        )}
      >
        {value ?? emptyAffordance}
      </span>
    </button>
  );
}
