import { useEffect, useState } from "react";
import { ShieldOff, Info, CalendarClock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeActiveNotifications,
  acknowledgeNotification,
} from "@/services/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Notification } from "@/types";

// Sticky banner stack shown beneath the header on every page. Custom — toast
// libraries like sonner are auto-dismissing primitives and these need to
// persist until SEP explicitly clicks dismiss. View-only users never see the
// stack and don't subscribe to the collection at all.
export default function NotificationBannerStack() {
  const { user, isViewer } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (isViewer || !user) return;
    return subscribeActiveNotifications((list) => {
      // Newest at the top so a fresh ground notification doesn't get buried.
      const sorted = [...list].sort(
        (a, b) =>
          (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
      );
      setNotifications(sorted);
    });
  }, [isViewer, user]);

  if (isViewer || notifications.length === 0) return null;

  const onDismiss = async (id: string) => {
    if (!user) return;
    await acknowledgeNotification(id, user.uid);
  };

  return (
    <div className="space-y-1.5">
      {notifications.map((n) => (
        <NotificationBanner
          key={n.id}
          notification={n}
          onDismiss={() => onDismiss(n.id)}
        />
      ))}
    </div>
  );
}

function NotificationBanner({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  const tone =
    notification.type === "auto-grounded"
      ? "red"
      : notification.type === "booking-reminder"
        ? "amber"
        : "neutral";
  const Icon =
    notification.type === "auto-grounded"
      ? ShieldOff
      : notification.type === "booking-reminder"
        ? CalendarClock
        : Info;
  const wrap =
    tone === "red"
      ? "border-sev-red-edge bg-sev-red-bg text-sev-red-fg"
      : tone === "amber"
        ? "border-sev-yellow-edge bg-sev-yellow-bg text-sev-yellow-fg"
        : "border-foreground/25 bg-card text-foreground";
  const iconColor =
    tone === "red"
      ? "text-sev-red-fg"
      : tone === "amber"
        ? "text-sev-yellow-fg"
        : "text-muted-foreground";
  const ackVariant =
    tone === "red"
      ? "border-sev-red-edge/50 bg-card text-sev-red-fg hover:bg-card/70"
      : tone === "amber"
        ? "border-sev-yellow-edge/60 bg-card text-sev-yellow-fg hover:bg-card/70"
        : "border-foreground/30 bg-card text-foreground hover:bg-card/70";
  const label =
    tone === "red"
      ? "ALERT"
      : tone === "amber"
        ? "REMINDER"
        : "NOTICE";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-stretch border shadow-sm",
        wrap,
      )}
    >
      {/* Severity left rail with all-caps label — like a publication kicker */}
      <div className="flex flex-col items-center justify-center border-r border-current/30 px-2.5 py-2">
        <Icon className={cn("h-4 w-4 mb-1", iconColor)} />
        <span className="text-[8px] font-bold uppercase tracking-spec">
          {label}
        </span>
      </div>
      <div className="flex flex-1 items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1 text-sm leading-snug">
          {notification.message}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-7 shrink-0 border px-2.5 text-[10px] font-semibold uppercase tracking-spec",
            ackVariant,
          )}
          onClick={onDismiss}
        >
          Acknowledge
        </Button>
      </div>
    </div>
  );
}
