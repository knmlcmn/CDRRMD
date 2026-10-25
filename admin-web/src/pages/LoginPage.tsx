import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  loginStaff,
  portalFromAccountId,
  requestStaffPasswordResetCode,
  resetStaffPassword,
  type StaffPortal,
} from '../services/authService';
import bangaPhoto from '../assets/Banga,_Calamba,_Laguna,_March_2023.jpg';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';

type Props = {
  onLoggedIn: (token: string, rememberMe: boolean, role: StaffPortal) => void;
};

function responseMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { message?: unknown } } };
  const message = candidate?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function IdCardIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8" cy="11" r="2" /><path d="M6 16c.6-1.5 1.5-2.2 2-2.2s1.4.7 2 2.2M13 10h5M13 14h5" /></svg>;
}

function LockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
}

function KeyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M15 8l2 2M17 6l2 2" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{hidden ? <path d="m4 4 16 16" /> : null}</svg>;
}

function ForwardArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h13M13 7l5 5-5 5" /></svg>;
}

function BackArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H6M11 7l-5 5 5 5" /></svg>;
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [recoveryPasswordsVisible, setRecoveryPasswordsVisible] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const portal = portalFromAccountId(accountId);
    if (!portal) {
      setError('Enter a valid Admin or Barangay Account ID.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setLoading(true);
    try {
      const data = await loginStaff(accountId, password);
      onLoggedIn(data.token, rememberMe, data.user.role);
    } catch {
      const accountType = portal === 'admin' ? 'Admin' : portal === 'barangay' ? 'Barangay' : 'staff';
      setError(`Login failed. Check your ${accountType} ID and password.`);
    } finally {
      setLoading(false);
    }
  }

  function showRecovery() {
    setRecovering(true);
    setError('');
    setRecoveryMessage('');
  }

  function showLogin() {
    setRecovering(false);
    setCodeSent(false);
    setRecoveryComplete(false);
    setVerificationCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setRecoveryMessage('');
  }

  async function requestRecoveryCode(event?: { preventDefault(): void }) {
    event?.preventDefault();
    const email = recoveryEmail.trim().toLowerCase();
    if (!email) {
      setError('Enter the registered email address for your Admin or Barangay account.');
      return;
    }
    setLoading(true);
    setError('');
    setRecoveryMessage('');
    try {
      const data = await requestStaffPasswordResetCode(email);
      setCodeSent(true);
      setRecoveryMessage(data.message || 'Check your email for the 6-digit verification code.');
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to send the verification code. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the 6-digit verification code from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await resetStaffPassword(
        recoveryEmail.trim().toLowerCase(),
        verificationCode,
        newPassword,
      );
      setRecoveryComplete(true);
      setRecoveryMessage(data.message || 'Your password has been reset. You can now log in.');
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to reset your password. Please request a new code and try again.'));
    } finally {
      setLoading(false);
    }
  }

  const identifiedPortal = portalFromAccountId(accountId);
  const accessLabel = identifiedPortal === 'admin'
    ? 'Admin personnel access'
    : identifiedPortal === 'barangay'
      ? 'Barangay personnel access'
      : 'Authorized personnel access';
  const systemVersion = String(import.meta.env.VITE_APP_VERSION || '').trim();

  return (
    <div className={`staff-auth admin-font-manrope ${recovering ? 'staff-auth-recovering' : ''}`}>
      <div className="staff-auth-grid" aria-hidden="true" />
      <div className="staff-auth-layout">
        <section className="staff-auth-form-panel">
          <div className="staff-auth-form-shell">
            <header className="staff-auth-identity">
              <img src={cdrrmdLogo} alt="CDRRMD official seal" className="staff-auth-identity-seal" />
              <div className="staff-auth-identity-copy">
                <span className="staff-auth-agency">CDRRMD</span>
                <span className="staff-auth-city">City of Calamba, Laguna</span>
              </div>
              <span className="staff-auth-access-label">{accessLabel}</span>
            </header>

            <div className="staff-auth-card">
              <div className="staff-auth-card-accent" aria-hidden="true" />
              <p className="staff-auth-eyebrow">Emergency Management Portal</p>
              <h1 className="staff-auth-title">{recovering ? 'Recover your account' : 'Welcome back'}</h1>
              <p className="staff-auth-subtitle">
                {recovering
                  ? 'Verify your registered staff email to securely reset your password.'
                  : 'Enter your official credentials to continue to the operations workspace.'}
              </p>

              {!recovering ? (
                <form onSubmit={onSubmit} className="staff-auth-form" noValidate>
                  <div className="staff-auth-control">
                    <label htmlFor="staff-account-id">Account ID</label>
                    <div className={`staff-auth-input ${error && !identifiedPortal ? 'staff-auth-input-error' : ''}`}>
                      <span className="staff-auth-input-icon"><IdCardIcon /></span>
                      <input
                        id="staff-account-id"
                        value={accountId}
                        onChange={(event) => { setAccountId(event.target.value.toUpperCase()); setError(''); }}
                        placeholder="ADM-YYYY-00000 or BRG-YYYY-00000"
                        autoComplete="username"
                        disabled={loading}
                        aria-describedby="account-id-hint login-feedback"
                        aria-invalid={Boolean(error && !identifiedPortal)}
                      />
                    </div>
                    <p id="account-id-hint" className="staff-auth-hint">Use the Account ID issued to your Admin or Barangay account.</p>
                  </div>

                  <div className="staff-auth-control">
                    <label htmlFor="staff-password">Password</label>
                    <div className={`staff-auth-input ${error && !password ? 'staff-auth-input-error' : ''}`}>
                      <span className="staff-auth-input-icon"><LockIcon /></span>
                      <input
                        id="staff-password"
                        value={password}
                        onChange={(event) => { setPassword(event.target.value); setError(''); }}
                        type={passwordVisible ? 'text' : 'password'}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        disabled={loading}
                        aria-describedby="login-feedback"
                        aria-invalid={Boolean(error && !password)}
                      />
                      <button type="button" className="staff-auth-visibility" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>
                        <EyeIcon hidden={!passwordVisible} />
                      </button>
                    </div>
                  </div>

                  <div className="staff-auth-options">
                    <label className="staff-auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
                    <button type="button" className="staff-auth-link" onClick={showRecovery}>Forgot password?</button>
                  </div>

                  {error ? <p id="login-feedback" className="staff-auth-feedback staff-auth-feedback-error" role="alert">{error}</p> : <span id="login-feedback" className="sr-only">Enter your Account ID and password.</span>}
                  <button type="submit" disabled={loading} className="staff-auth-submit">
                    {loading ? <><span className="staff-auth-spinner" aria-hidden="true" />Signing in...</> : <><span>Sign in securely</span><span className="staff-auth-submit-arrow"><ForwardArrowIcon /></span></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={codeSent ? submitPasswordReset : requestRecoveryCode} className="staff-auth-form" noValidate>
                  {!recoveryComplete ? <>
                    {!codeSent ? (
                    <div className="staff-auth-control">
                      <label htmlFor="recovery-email">Registered staff email</label>
                      <div className="staff-auth-input"><span className="staff-auth-input-icon"><MailIcon /></span><input id="recovery-email" value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setCodeSent(false); setVerificationCode(''); setRecoveryMessage(''); setError(''); }} type="email" placeholder="name@official-email.gov" autoComplete="email" disabled={loading} /></div>
                      <p className="staff-auth-hint">We will send a 6-digit verification code that expires in 10 minutes.</p>
                    </div>
                    ) : <div className="staff-auth-recovery-recipient"><MailIcon /><span>Verification code sent to <strong>{recoveryEmail.trim().toLowerCase()}</strong></span></div>}
                    {codeSent ? <>
                      <div className="staff-auth-control"><label htmlFor="recovery-code">Verification code</label><div className="staff-auth-input"><span className="staff-auth-input-icon"><KeyIcon /></span><input id="recovery-code" value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} inputMode="numeric" placeholder="6-digit code" autoComplete="one-time-code" disabled={loading} /></div></div>
                      <div className="staff-auth-control"><label htmlFor="new-password">New password</label><div className="staff-auth-input"><span className="staff-auth-input-icon"><LockIcon /></span><input id="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(''); }} type={recoveryPasswordsVisible ? 'text' : 'password'} placeholder="At least 6 characters" autoComplete="new-password" disabled={loading} /><button type="button" className="staff-auth-visibility" onClick={() => setRecoveryPasswordsVisible((visible) => !visible)} aria-label={recoveryPasswordsVisible ? 'Hide new passwords' : 'Show new passwords'}><EyeIcon hidden={!recoveryPasswordsVisible} /></button></div></div>
                      <div className="staff-auth-control"><label htmlFor="confirm-password">Confirm new password</label><div className="staff-auth-input"><span className="staff-auth-input-icon"><LockIcon /></span><input id="confirm-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(''); }} type={recoveryPasswordsVisible ? 'text' : 'password'} placeholder="Repeat your new password" autoComplete="new-password" disabled={loading} /></div></div>
                    </> : null}
                  </> : null}

                  {recoveryMessage ? <p className="staff-auth-feedback staff-auth-feedback-success" role="status">{recoveryMessage}</p> : null}
                  {error ? <p className="staff-auth-feedback staff-auth-feedback-error" role="alert">{error}</p> : null}
                  {!recoveryComplete ? <button type="submit" disabled={loading} className="staff-auth-submit">{loading ? <><span className="staff-auth-spinner" aria-hidden="true" />Please wait...</> : codeSent ? 'Reset password' : 'Send verification code'}</button> : null}
                  {codeSent && !recoveryComplete ? <button type="button" disabled={loading} onClick={() => void requestRecoveryCode()} className="staff-auth-secondary">Resend verification code</button> : null}
                  <button type="button" disabled={loading} onClick={showLogin} className="staff-auth-link staff-auth-back"><BackArrowIcon />Back to sign in</button>
                </form>
              )}
            </div>

            <footer className="staff-auth-footer">
              <span>City Disaster Risk Reduction and Management Division</span>
              <span>Authorized personnel use only{systemVersion ? ` · Version ${systemVersion}` : ''}</span>
            </footer>
          </div>
        </section>

        <aside className="staff-auth-visual" aria-label="CDRRMD institutional identity">
          <img src={bangaPhoto} alt="Calamba City monument" className="staff-auth-visual-image" />
          <div className="staff-auth-visual-overlay" aria-hidden="true" />
          <div className="staff-auth-contours" aria-hidden="true" />
          <div className="staff-auth-visual-content">
            <div className="staff-auth-seal-stage"><img src={cdrrmdLogo} alt="CDRRMD official seal" /></div>
            <p className="staff-auth-visual-eyebrow">City of Calamba</p>
            <h2>Prepared. Coordinated.<br />Ready to respond.</h2>
            <span className="staff-auth-gold-rule" aria-hidden="true" />
            <p className="staff-auth-visual-name">City Disaster Risk Reduction<br />and Management Division</p>
            <div className="staff-auth-capabilities" aria-label="Platform capabilities"><span>Emergency Operations</span><span>GIS Coordination</span><span>Barangay Response</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
