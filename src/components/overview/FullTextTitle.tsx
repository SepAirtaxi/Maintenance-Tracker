import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Truncated event/defect title that opens a bare dialog with the full text
// on click. Dismissed by clicking the backdrop or pressing Esc — no chrome,
// no extra data, just the words.
export default function FullTextTitle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 truncate text-left hover:underline decoration-foreground/30 underline-offset-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        title="Click to see full text"
      >
        {text}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          // Hide the built-in close X — backdrop click / Esc dismisses.
          className="max-w-xl p-6 [&>button:last-child]:hidden"
        >
          <DialogTitle className="font-sans text-base font-medium leading-relaxed tracking-normal whitespace-pre-wrap break-words">
            {text}
          </DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}
