import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import OverviewPage from "@/pages/OverviewPage";
import CalendarPage from "@/pages/CalendarPage";
import SettingsPage from "@/pages/SettingsPage";
import LoginPage from "@/pages/LoginPage";
import ProfilePage from "@/pages/ProfilePage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<OverviewPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute membersOnly>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          {/* Old /aircraft URL — redirect to settings for any bookmarked links. */}
          <Route
            path="/aircraft"
            element={<Navigate to="/settings" replace />}
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute membersOnly>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
