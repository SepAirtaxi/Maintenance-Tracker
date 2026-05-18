import { useEffect, useState } from "react";
import { ShieldOff, Info, X } from "lucide-react";
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
  const isGrounded = notification.type === "auto-grounded";
  const Icon = isGrounded ? ShieldOff : Info;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 shadow-sm",
        isGrounded
          ? "border-status-red/50 bg-rose-50 text-rose-900"
          : "border-sky-300/60 bg-sky-50 text-sky-900",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          isGrounded ? "text-status-red" : "text-sky-600",
        )}
      />
      <div className="min-w-0 flex-1 text-sm leading-snug">
        {notification.message}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "h-6 w-6 shrink-0",
          isGrounded
            ? "text-rose-900 hover:bg-rose-100 hover:text-rose-950"
            : "text-sky-900 hover:bg-sky-100 hover:text-sky-950",
        )}
        onClick={onDismiss}
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
