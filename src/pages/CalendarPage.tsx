import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BookingDialog from "@/components/calendar/BookingDialog";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import { useAuth } from "@/context/AuthContext";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeBookings } from "@/services/bookings";
import { subscribeEvents } from "@/services/events";
import type { Aircraft, Booking, MaintenanceEvent } from "@/types";

type ViewMode = "week" | "month";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getVisibleDays(viewMode: ViewMode, anchor: Date): Date[] {
  if (viewMode === "week") {
    return Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  }
  const start = startOfMonth(anchor);
  const n = daysInMonth(start.getFullYear(), start.getMonth());
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

function formatRangeLabel(days: Date[], viewMode: ViewMode): string {
  if (days.length === 0) return "";
  if (viewMode === "week") {
    const first = days[0];
    const last = days[days.length - 1];
    if (first.getFullYear() === last.getFullYear()) {
      if (first.getMonth() === last.getMonth()) {
        return `${format(first, "d")} – ${format(last, "d MMM yyyy")}`;
      }
      return `${format(first, "d MMM")} – ${format(last, "d MMM yyyy")}`;
    }
    return `${format(first, "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
  }
  return format(days[0], "MMMM yyyy");
}

export default function CalendarPage() {
  const { isViewer } = useAuth();
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [prefillTail, setPrefillTail] = useState<string>("");
  const [prefillFrom, setPrefillFrom] = useState<Date | null>(null);

  useEffect(() => subscribeAircraft(setFleet), []);
  useEffect(() => subscribeBookings(setBookings), []);
  useEffect(() => subscribeEvents(setEvents), []);

  const days = useMemo(() => getVisibleDays(viewMode, anchor), [viewMode, anchor]);
  const rangeLabel = useMemo(
    () => formatRangeLabel(days, viewMode),
    [days, viewMode],
  );

  const goPrev = () => {
    setAnchor((a) =>
      viewMode === "week" ? addDays(a, -7) : addMonths(a, -1),
    );
  };
  const goNext = () => {
    setAnchor((a) =>
      viewMode === "week" ? addDays(a, 7) : addMonths(a, 1),
    );
  };
  const goToday = () => {
    setAnchor(
      viewMode === "week"
        ? startOfDay(new Date())
        : startOfMonth(new Date()),
    );
  };

  const switchViewMode = (next: ViewMode) => {
    if (next === viewMode) return;
    setViewMode(next);
    setAnchor(
      next === "week"
        ? startOfDay(new Date())
        : startOfMonth(new Date()),
    );
  };

  const openCreate = (tail = "", from: Date | null = null) => {
    setEditingBooking(null);
    setPrefillTail(tail);
    setPrefillFrom(from);
    setDialogOpen(true);
  };

  const openEdit = (b: Booking) => {
    setEditingBooking(b);
    setPrefillTail("");
    setPrefillFrom(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Maintenance Calendar
          </h1>
          <p className="text-xs text-muted-foreground">
            Hangar bookings, one row per tail. Click an empty cell to book.
          </p>
        </div>
        {!isViewer && (
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            New booking
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card shadow-sm px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goPrev}
            title={viewMode === "week" ? "Previous week" : "Previous month"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={goToday}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goNext}
            title={viewMode === "week" ? "Next week" : "Next month"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium tabular-nums">{rangeLabel}</span>

        <div className="ml-auto inline-flex rounded-md border bg-card p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => switchViewMode("week")}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              viewMode === "week"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => switchViewMode("month")}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              viewMode === "month"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Month
          </button>
        </div>
      </div>

      <CalendarGrid
        days={days}
        fleet={fleet}
        bookings={bookings}
        events={events}
        viewMode={viewMode}
        readOnly={isViewer}
        onSelectBooking={(b) => (isViewer ? undefined : openEdit(b))}
        onCreateForCell={(tail, day) =>
          isViewer ? undefined : openCreate(tail, day)
        }
      />

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fleet={fleet}
        events={events}
        booking={editingBooking}
        prefill={{ tailNumber: prefillTail, from: prefillFrom }}
      />
    </div>
  );
}
