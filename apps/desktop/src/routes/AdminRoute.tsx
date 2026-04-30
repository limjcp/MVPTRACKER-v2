import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchUserRole } from '../lib/userRole';

type Phase = 'loading' | 'admin' | 'redirectHome' | 'redirectStaff';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setPhase('redirectHome');
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await client.auth.getSession();
      if (cancelled) return;
      if (error || !data.session) {
        setPhase('redirectHome');
        return;
      }
      try {
        const role = await fetchUserRole(data.session.user.id);
        if (cancelled) return;
        if (role === 'admin') {
          setPhase('admin');
        } else {
          setPhase('redirectStaff');
        }
      } catch {
        if (cancelled) return;
        setPhase('redirectStaff');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0D0F14] text-white/50 flex items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (phase === 'admin') {
    return <>{children}</>;
  }

  if (phase === 'redirectHome') {
    return <Navigate to="/" replace />;
  }

  return <Navigate to="/staff" replace />;
}
