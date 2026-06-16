import React, { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from './supabaseClient';

export default function Login() {
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  const resetPasswordUrl = `${appUrl}/reset-password`;
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible iniciar sesion.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetPasswordUrl,
      });
      if (error) throw error;
      setSuccessMsg('Te enviamos un enlace para actualizar la contrasena.');
      setAuthMode('login');
    } catch (error) {
      setErrorMsg(error.message || 'No fue posible enviar el correo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell auth-shell-compact">
      <div className="auth-panel auth-panel-form">
        <div className="brand-badge">
          <ShieldCheck />
          RRHH Admin
        </div>
        <div className="auth-header">
          <h2>Ingreso RRHH</h2>
        </div>

        {errorMsg ? (
          <div className="feedback feedback-error">
            <AlertCircle />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div className="feedback feedback-success">
            <ShieldCheck />
            <span>{successMsg}</span>
          </div>
        ) : null}

        {authMode === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Correo
              <span className="input-shell">
                <Mail />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </span>
            </label>

            <label>
              Contrasena
              <span className="input-shell">
                <Lock />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="icon-button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>

            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" /> : <LogIn />}
              <span>{isLoading ? 'Ingresando...' : 'Entrar al panel'}</span>
            </button>

            <button className="link-button" type="button" onClick={() => setAuthMode('reset')}>
              Olvide mi contrasena
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handlePasswordReset}>
            <label>
              Correo
              <span className="input-shell">
                <Mail />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </span>
            </label>

            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" /> : <KeyRound />}
              <span>{isLoading ? 'Enviando...' : 'Enviar enlace'}</span>
            </button>

            <button className="link-button" type="button" onClick={() => setAuthMode('login')}>
              Volver al login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
