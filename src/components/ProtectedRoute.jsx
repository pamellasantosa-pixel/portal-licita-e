import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getSupabaseClientOrThrow } from "../lib/supabaseClient";

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClientOrThrow();
    let isMounted = true;

    // Fallback de segurança para evitar estado pendente infinito caso a rede demore.
    const timeoutId = window.setTimeout(() => {
      if (isMounted) setIsChecking(false);
    }, 8000);

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setIsChecking(false);
      window.clearTimeout(timeoutId);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setIsChecking(false);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  if (isChecking) {
    return <p className="p-6 font-body text-brand-ink/80">Verificando autenticacao...</p>;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return children;
}
