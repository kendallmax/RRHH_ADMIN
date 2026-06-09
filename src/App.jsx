import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import Login from './Login';
import ResetPassword from './ResetPassword';
import HRDashboard from './HRDashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setIsCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  const navigateToLogin = () => {
    window.history.replaceState({}, '', '/');
    setPathname('/');
  };

  if (isCheckingSession) {
    return (
      <div className="screen-center">
        <div className="loading-card">
          <Loader2 className="loading-spinner" />
          <div>
            <h1>RRHH Conecte</h1>
            <p>Preparando el panel de administracion...</p>
          </div>
        </div>
      </div>
    );
  }

  if (pathname === '/reset-password') {
    return <ResetPassword onBackToLogin={navigateToLogin} />;
  }

  return session ? <HRDashboard session={session} /> : <Login />;
}
