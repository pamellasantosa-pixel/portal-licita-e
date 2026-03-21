import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import BidsPage from "./pages/BidsPage";
import BidDetailsPage from "./pages/BidDetailsPage";
import DocumentsPage from "./pages/DocumentsPage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import { getSupabaseClientOrThrow } from "./lib/supabaseClient";

function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const supabase = getSupabaseClientOrThrow();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <p className="p-6 font-body text-brand-ink/80">Verificando autenticacao...</p>;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bids"
        element={
          <ProtectedRoute>
            <BidsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bids/:id"
        element={
          <ProtectedRoute>
            <BidDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <DocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
