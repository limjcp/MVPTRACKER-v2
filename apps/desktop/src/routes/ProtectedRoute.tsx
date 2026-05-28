import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import StaffBackgroundServices from '../staff/StaffBackgroundServices';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthed(false);
      setReady(true);
      return;
    }
    void client.auth.getSession().then(({ data, error }) => {
      let isAuthed = !!data.session;
      if (error && !data.session) {
        try {
          const authKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (authKey) {
            const rawTokenData = localStorage.getItem(authKey);
            if (rawTokenData) {
              const parsedToken = JSON.parse(rawTokenData);
              if (parsedToken?.access_token) {
                isAuthed = true;
              }
            }
          }
        } catch {
          // ignore
        }
      }
      setAuthed(isAuthed);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0D0F14] text-white/50 flex items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (!supabase || !authed) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <StaffBackgroundServices />
      {children}
    </>
  );
}
