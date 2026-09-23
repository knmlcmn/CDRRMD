import { useState } from 'react';
import type { FormEvent } from 'react';
import { loginStaff, portalFromAccountId, type StaffPortal } from '../services/authService';
import bangaPhoto from '../assets/Banga,_Calamba,_Laguna,_March_2023.jpg';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { d } from '../adminDesign';

type Props = {
  onLoggedIn: (token: string, rememberMe: boolean, role: StaffPortal) => void;
};

export default function LoginPage({ onLoggedIn }: Props) {
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginStaff(accountId, password);
      onLoggedIn(data.token, rememberMe, data.user.role);
    } catch {
      const portal = portalFromAccountId(accountId);
      const accountType = portal === 'admin' ? 'Admin' : portal === 'barangay' ? 'Barangay' : portal === 'rescuer' ? 'CDRRMD Rescuer' : 'staff';
      setError(`Login failed. Check your ${accountType} ID and password.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={d.login.root}>
      <div className={d.login.layout}>
        <section className={d.login.left}>
          <p className={d.login.overline}>CDRRMD Staff Access</p>
          <h1 className={d.login.title}>WELCOME BACK!</h1>

          <form onSubmit={onSubmit} className={d.login.form}>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value.toUpperCase())}
              placeholder="Account ID (ADM-, BRG-, or RSC-YYYY-00000)"
              className={d.login.input}
              autoComplete="username"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className={d.login.input}
            />

            <label className={d.login.rememberLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={d.login.checkbox}
              />
              Remember me
            </label>

            {error ? <p className={d.login.error}>{error}</p> : null}

            <button disabled={loading} className={d.login.loginBtn}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </section>

        <section className={d.login.right}>
          <img
            src={bangaPhoto}
            alt="Calamba monument"
            className={d.login.heroImg}
          />
          <div className={d.login.overlay} />

          <div className={d.login.heroBody}>
            <img
              src={cdrrmdLogo}
              alt="CDRRMD logo"
              className={d.login.seal}
            />
            <p className={d.login.heroTitle}>City Disaster Risk Reduction</p>
            <p className={d.login.heroTitle}>and Management Division</p>
          </div>
        </section>
      </div>
    </div>
  );
}
