import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

type Props = {
  children: ReactNode;
  // If true, viewer (anonymous) accounts are bounced back to the overview.
  membersOnly?: boolean;
};

export default function ProtectedRoute({ children, membersOnly }: Props) {
  const { user, isViewer, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (membersOnly && isViewer) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
