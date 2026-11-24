import {
  FormEvent,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { TASK_DETAIL_MAX, TASK_TITLE_MAX } from "@/services/tasks";
import type { Task, UserProfile } from "@/types";

// The first few notes in a column are what the person is on right now; the
// rest reads as backlog below a divider.
export const NOW_COUNT = 3;

type Mode = "active" | "done";

function ageLabel(task: Task): string {
  const days = Math.floor(
    (Date.now() - task.createdAt.toMillis()) / 86_400_000,
  );
  if (days < 1) return "today";
  if (days < 60) return `${days} d`;
  return `${Math.floor(days / 30)} mo`;
}

export default function TaskColumn({
  person,
  isMine,
  active,
  done,
  onAdd,
  onReorder,
  onComplete,
  onReopen,
  onEdit,
  onPaste,
}: {
  person: UserProfile;
  isMine: boolean;
  active: Task[];
  done: Task[];
  onAdd: (title: string, detail: string) => Promise<void>;
  onReorder: (ordered: Task[]) => void;
  onComplete: (task: Task) => void;
  onReopen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onPaste: () => void;
}) {
  const [mode, setMode] = useState<Mode>("active");
  const [draft, setDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const titleInput = useRef<HTMLInputElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  // Insertion point while dragging: the dragged note lands before the note
  // at this index (or at the end when it equals the list length).
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const localBody = useRef<HTMLDivElement | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= active.length || from === to) return;
    const next = [...active];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    onReorder(next);
  };

  const endDrag = () => {
    setDragId(null);
    setDropIndex(null);
  };

  const onDragOverNote = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropIndex(before ? index : index + 1);
  };

  const onDrop = (e: DragEvent) => {
    if (!dragId || dropIndex === null) return endDrag();
    e.preventDefault();
    const from = active.findIndex((t) => t.id === dragId);
    if (from >= 0) {
      // Removing the note first shifts every later slot up by one.
      const to = dropIndex > from ? dropIndex - 1 : dropIndex;
      move(from, to);
    }
    endDrag();
  };

  const submitDraft = async (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await onAdd(title, draftNote);
      setDraft("");
      setDraftNote("");
      titleInput.current?.focus();
      // New notes land at the bottom — bring them into view.
      requestAnimationFrame(() =>
        localBody.current?.scrollTo({
          top: localBody.current.scrollHeight,
          behavior: "smooth",
        }),
      );
    } finally {
      setAdding(false);
    }
  };

  const doneSorted = [...done].sort(
    (a, b) => (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0),
  );

  return (
    <section
      className={cn(
        "flex h-[calc(100vh-var(--header-h,90px)-165px)] min-h-[480px] min-w-0 flex-col border bg-card",
        isMine ? "border-foreground/40" : "border-foreground/15",
      )}
    >
      {/* Column head — who, how many, active/done switch */}
      <header className="space-y-2 border-b border-foreground/15 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center bg-foreground font-mono text-[10px] font-bold tracking-stamp text-background">
            {person.initials}
          </span>
          <div className="min-w-0 flex-1 leading-none">
            <div
              className="truncate font-display text-[15px] font-medium tracking-tight"
              title={person.displayName ?? person.email}
            >
              {person.displayName ?? person.email}
            </div>
            {isMine && <span className="label-eyebrow mt-1 block">Your desk</span>}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="readout text-xl font-bold leading-none">{active.length}</span>
            <span className="label-eyebrow">active</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex border border-foreground/20 divide-x divide-foreground/15">
            {(["active", "done"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold uppercase tracking-spec transition-colors",
                  mode === m
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "active" ? "Active" : "Done"}
                <span className="ml-1.5 font-mono text-[9px] opacity-70">
                  {m === "active" ? active.length : done.length}
                </span>
              </button>
            ))}
          </div>
          {isMine && mode === "active" && (
            <button
              type="button"
              onClick={onPaste}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-spec text-muted-foreground hover:text-foreground"
              title="Add many tasks at once, one per line"
            >
              <ClipboardList className="h-3 w-3" />
              Paste list
            </button>
          )}
        </div>
      </header>

      {/* Quick add — own column only, title plus an optional note line.
          Enter in either field adds the task. */}
      {isMine && mode === "active" && (
        <form
          onSubmit={submitDraft}
          className="space-y-1.5 border-b border-foreground/15 bg-background/40 p-2"
        >
          <div className="relative">
            <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={titleInput}
              value={draft}
              maxLength={TASK_TITLE_MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a task"
              className="h-8 pl-8 text-[13px]"
            />
          </div>
          <div className="flex gap-1.5">
            <Input
              value={draftNote}
              maxLength={TASK_DETAIL_MAX}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Note (optional)"
              className="h-7 flex-1 text-xs"
            />
            <button
              type="submit"
              disabled={!draft.trim() || adding}
              className="inline-flex h-7 shrink-0 items-center gap-1 border border-foreground/30 bg-card px-2.5 text-[10px] font-bold uppercase tracking-spec text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* Body — the column has a fixed height and the list scrolls inside,
          so a long backlog never stretches the page and desks line up. */}
      <div
        ref={localBody}
        className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]"
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          // Empty space below the last note = drop at the end.
          if (e.target === e.currentTarget) setDropIndex(active.length);
        }}
        onDrop={onDrop}
      >
        {mode === "active" ? (
          active.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs italic text-muted-foreground">
              {isMine ? "Nothing on your desk. Add a task above." : "Nothing on the desk."}
            </p>
          ) : (
            <ol className="space-y-1.5">
              {active.map((t, i) => (
                <li key={t.id}>
                  {i === NOW_COUNT && (
                    <div className="mb-1.5 mt-3 flex items-center gap-2 px-1">
                      <span className="label-eyebrow">
                        Backlog · {active.length - NOW_COUNT}
                      </span>
                      <span className="h-px flex-1 bg-foreground/10" />
                    </div>
                  )}
                  <TaskNote
                    task={t}
                    index={i}
                    isLast={i === active.length - 1}
                    isMine={isMine}
                    dragging={dragId === t.id}
                    dropBefore={dropIndex === i && dragId !== null}
                    dropAfter={
                      dropIndex === active.length && i === active.length - 1 && dragId !== null
                    }
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", t.id);
                      setDragId(t.id);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => onDragOverNote(e, i)}
                    onUp={(toTop) => move(i, toTop ? 0 : i - 1)}
                    onDown={(toBottom) => move(i, toBottom ? active.length - 1 : i + 1)}
                    onComplete={() => onComplete(t)}
                    onEdit={() => onEdit(t)}
                  />
                </li>
              ))}
            </ol>
          )
        ) : doneSorted.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs italic text-muted-foreground">
            Nothing finished yet.
          </p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {doneSorted.map((t) => (
              <li
                key={t.id}
                className="group flex items-center gap-2 px-1.5 py-1 text-xs"
                title={t.detail ? `${t.title}\n\n${t.detail}` : t.title}
              >
                <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground line-through decoration-foreground/30">
                  {t.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                  {formatDate(t.doneAt)}
                </span>
                {isMine && (
                  <button
                    type="button"
                    onClick={() => onReopen(t)}
                    title="Put back on the desk (bottom of the list)"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

    </section>
  );
}

function TaskNote({
  task,
  index,
  isLast,
  isMine,
  dragging,
  dropBefore,
  dropAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onUp,
  onDown,
  onComplete,
  onEdit,
}: {
  task: Task;
  index: number;
  isLast: boolean;
  isMine: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onUp: (toTop: boolean) => void;
  onDown: (toBottom: boolean) => void;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const isNow = index < NOW_COUNT;
  return (
    <div
      draggable={isMine}
      onDragStart={isMine ? onDragStart : undefined}
      onDragEnd={isMine ? onDragEnd : undefined}
      onDragOver={isMine ? onDragOver : undefined}
      className={cn(
        "group relative flex gap-1.5 border py-1.5 pl-1 pr-1.5 transition-colors",
        isNow
          ? "border-foreground/25 border-l-2 border-l-primary bg-background"
          : "border-foreground/10 bg-background/60",
        isMine && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      {dropBefore && (
        <span className="pointer-events-none absolute -top-[5px] left-0 right-0 h-[2px] bg-primary" />
      )}
      {dropAfter && (
        <span className="pointer-events-none absolute -bottom-[5px] left-0 right-0 h-[2px] bg-primary" />
      )}

      {/* Left rail — priority number, grip on hover for the owner */}
      <div className="relative flex w-6 shrink-0 justify-center pt-px">
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums leading-5",
            isNow ? "font-bold text-foreground" : "text-muted-foreground",
            isMine && "group-hover:invisible",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {isMine && (
          <GripVertical className="invisible absolute top-[3px] h-3.5 w-3.5 text-muted-foreground group-hover:visible" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] font-medium leading-5 text-foreground">
          {task.title}
        </p>
        {task.detail && (
          <p
            className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-xs leading-4 text-muted-foreground"
            title={task.detail}
          >
            {task.detail}
          </p>
        )}
        <div className="mt-1 flex h-5 items-center gap-2">
          <span
            className="font-mono text-[9px] uppercase tracking-spec text-muted-foreground/80"
            title={`Added ${formatDate(task.createdAt)}`}
          >
            {ageLabel(task)}
          </span>
          {isMine && (
            <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <NoteAction onClick={onEdit} title="Edit or delete">
                <Pencil className="h-3 w-3" />
              </NoteAction>
              <NoteAction onClick={onComplete} title="Mark as done" strong>
                <Check className="h-3 w-3" />
                Done
              </NoteAction>
            </div>
          )}
        </div>
      </div>

      {/* Right rail — move up/down (owner only). Shift-click jumps to the
          top/bottom. */}
      {isMine && (
        <div className="flex shrink-0 flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <ArrowButton
            disabled={index === 0}
            onClick={(e) => onUp(e.shiftKey)}
            title="Move up (Shift-click: to top)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </ArrowButton>
          <ArrowButton
            disabled={isLast}
            onClick={(e) => onDown(e.shiftKey)}
            title="Move down (Shift-click: to bottom)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </ArrowButton>
        </div>
      )}
    </div>
  );
}

function ArrowButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: (e: MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function NoteAction({
  children,
  onClick,
  title,
  strong = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 border px-1.5 text-[9px] font-bold uppercase tracking-spec transition-colors",
        strong
          ? "border-foreground/30 text-foreground hover:border-foreground hover:bg-foreground hover:text-background"
          : "border-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
