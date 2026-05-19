import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');

const EyeIcon = ({ show }) => show
  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

export default function Auth({ onLogin }) {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'force-reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = (keepEmail = false) => {
    setPassword(''); setConfirmPassword(''); setError(''); setSuccessMsg('');
    if (!keepEmail) setEmail('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // Client-side validation — matches backend minimums exactly
    if (view !== 'login') {
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
    }

    setLoading(true);
    try {
      let endpoint = '/api/auth/login';
      let payload = { email: email.toLowerCase().trim(), password };
      let headers = { 'Content-Type': 'application/json' };

      if (view === 'force-reset') {
        endpoint = '/api/auth/force-reset';
        payload = { newPassword: password };
        headers['Authorization'] = `Bearer ${tempToken}`;
      }

      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.message || 'Authentication failed');

      if (view === 'login') {
        if (data.mustResetPassword) {
          // Store temp token & switch to force-reset screen
          setTempToken(data.token);
          setView('force-reset');
          reset(true); // keep email for display
          setSuccessMsg('Welcome! Please set a new secure password to continue.');
        } else {
          localStorage.setItem('edp_token', data.token);
          localStorage.setItem('edp_user', data.email);
          localStorage.setItem('edp_role', data.role);
          onLogin(data.token, data.email, data.role);
        }
      } else if (view === 'force-reset') {
        // Password reset done — issue final token and log in
        localStorage.setItem('edp_token', data.token);
        localStorage.setItem('edp_user', email || data.email);
        localStorage.setItem('edp_role', data.role);
        onLogin(data.token, email || data.email, data.role);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white text-gray-900 placeholder-gray-400";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 w-full max-w-md p-8 border border-gray-100">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-violet-700">Deepraj Mail Pro</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            {view === 'login' && 'Sign in to your workspace'}
            {view === 'force-reset' && 'Set your new secure password'}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5 bg-red-50 border border-red-100 text-sm text-red-700 font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}
        {successMsg && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5 bg-blue-50 border border-blue-100 text-sm text-blue-700 font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email — hidden on force-reset since we already know it */}
          {view !== 'force-reset' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className={inputCls} placeholder="you@company.com" autoComplete="email" />
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {view === 'login' ? 'Password' : 'New Password (min. 8 characters)'}
            </label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} required value={password}
                onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`}
                placeholder="••••••••" autoComplete={view === 'login' ? "current-password" : "new-password"} />
              <button type="button" onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                <EyeIcon show={showPassword} />
              </button>
            </div>
          </div>

          {/* Confirm Password — only on force-reset */}
          {view === 'force-reset' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} className={`${inputCls} pr-10`}
                  placeholder="••••••••" autoComplete="new-password" />
              </div>
              {/* Password strength hint */}
              {password && (
                <div className="mt-2 flex gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= 8 && i === 0 ? 'bg-red-400' :
                      password.length >= 10 && i <= 1 ? 'bg-amber-400' :
                      password.length >= 12 && i <= 2 ? 'bg-blue-400' :
                      password.length >= 14 && i <= 3 ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  ))}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold py-2.5 rounded-xl hover:from-blue-700 hover:to-violet-700 transition-all shadow-md shadow-blue-200/60 disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : view === 'login' ? 'Sign In →' : 'Save Password & Continue →'}
          </button>
        </form>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-gray-400">
          {view === 'login' && 'No account? Contact your Administrator.'}
          {view === 'force-reset' && 'Your credentials are encrypted and stored securely.'}
        </p>
      </div>
    </div>
  );
}
