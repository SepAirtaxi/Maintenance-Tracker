import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Props = {
  value: string | null;
  readOnly?: boolean;
  onSave: (next: string | null) => Promise<void>;
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

function EditableWorkOrderCell({ value, onSave }: Props) {
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
    return (
      <div className="flex flex-col min-w-0">
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
            className="h-6 px-1.5 text-xs font-mono"
            placeholder="WO number"
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
          <span className="text-[10px] text-destructive">{error}</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left min-w-0 group rounded px-1 py-0.5 hover:bg-secondary"
      title="Click to edit work order number"
    >
      <span
        className={cn(
          "block font-mono text-xs truncate group-hover:underline",
          !value && "text-muted-foreground italic",
        )}
      >
        {value ?? "add…"}
      </span>
    </button>
  );
}
