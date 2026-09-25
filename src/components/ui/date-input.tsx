import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { isoToDmy, maskDmy, parseDmy, toIso } from "@/lib/dmy";
import { Input } from "./input";

type Props = {
  id?: string;
  // YYYY-MM-DD, same as a native date input — "" when empty or incomplete.
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

// Drop-in replacement for <input type="date">. The browser's own date field
// takes its day/month order from the OS language, so a US-English machine
// shows MM/DD/YYYY. This one is always typed and shown as DD-MM-YYYY; the
// calendar icon still pops the browser's picker, kept off-screen.
export function DateInput({
  id,
  value,
  onChange,
  min,
  required,
  disabled,
  placeholder = "DD-MM-YYYY",
  className,
}: Props) {
  const [text, setText] = useState(() => isoToDmy(value));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const parsed = parseDmy(text);
  const textIso = parsed ? toIso(parsed) : "";

  // Follow outside changes (dialog prefill / reset) without clobbering a
  // half-typed entry, which reports "" upward while incomplete.
  useEffect(() => {
    if (value !== textIso) setText(isoToDmy(value));
  }, [value]);

  // Block form submit on a partial, impossible or too-early date.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    let msg = "";
    if (text !== "" && !parsed) msg = "Enter a valid date as DD-MM-YYYY";
    else if (min && textIso && textIso < min)
      msg = `Date can't be before ${isoToDmy(min)}`;
    el.setCustomValidity(msg);
  }, [text, parsed, textIso, min]);

  const update = (next: string) => {
    setText(next);
    const d = parseDmy(next);
    onChange(d ? toIso(d) : "");
  };

  const openPicker = () => {
    const el = pickerRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  return (
    <div className="relative">
      <Input
        ref={textRef}
        id={id}
        value={text}
        onChange={(e) => update(maskDmy(e.target.value))}
        placeholder={placeholder}
        inputMode="numeric"
        spellCheck={false}
        autoComplete="off"
        required={required}
        disabled={disabled}
        className={cn(
          "pr-9 font-mono placeholder:text-muted-foreground/50",
          className,
        )}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Pick a date"
        tabIndex={-1}
        className="absolute right-0 top-0 grid h-9 w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={textIso}
        min={min}
        onChange={(e) => update(isoToDmy(e.target.value))}
        className="pointer-events-none absolute bottom-0 right-3 h-0 w-0 border-0 p-0 opacity-0"
      />
    </div>
  );
}
