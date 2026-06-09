import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
} from 'lucide-react';
import { supabase } from './supabaseClient';

export default function ResetPassword({ onBackToLogin }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    const resolveRecoverySession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setErrorMsg('No pudimos validar el enlace de recuperacion.');
      } else {
        setHasRecoverySession(Boolean(data.session));
      }
      setIsCheckingLink(false);
    };

    resolveRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setHasRecoverySession(Boolean(session));
        setErrorMsg('');
        setIsCheckingLink(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!password || password !== confirmPassword || password.length < 6) {
      setErrorMsg('Revisa la contrasena nueva y su confirmacion.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccessMsg('Contrasena actualizada correctamente.');
      window.history.replaceState({}, '', '/');
      window.setTimeout(onBackToLogin, 1200);
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible actualizar la contrasena.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="screen-center">
      <div className="reset-card">
        <div className="reset-icon">
          <KeyRound />
        </div>
        <h1>Nueva contrasena</h1>
        <p>Actualiza tu acceso al portal RRHH.</p>

        {errorMsg ? (
          <div className="feedback feedback-error">
            <AlertCircle />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div className="feedback feedback-success">
            <CheckCircle2 />
            <span>{successMsg}</span>
          </div>
        ) : null}

        {isCheckingLink ? (
          <div className="reset-loading">
            <Loader2 className="spin" />
            <span>Validando el enlace...</span>
          </div>
        ) : hasRecoverySession ? (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <label>
              Nueva contrasena
              <span className="input-shell">
                <Lock />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="icon-button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>

            <label>
              Confirmar contrasena
              <span className="input-shell">
                <Lock />
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </span>
            </label>

            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" /> : <CheckCircle2 />}
              <span>{isLoading ? 'Guardando...' : 'Guardar contrasena'}</span>
            </button>
          </form>
        ) : (
          <button className="secondary-button" type="button" onClick={onBackToLogin}>
            <ArrowLeft />
            <span>Volver al login</span>
          </button>
        )}
      </div>
    </div>
  );
}
