import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import bangaPhoto from '../assets/Banga,_Calamba,_Laguna,_March_2023.jpg';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { d } from '../barangayDesign';

type Props = {
  onLoggedIn: (token: string, refreshToken: string, rememberMe: boolean) => void;
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
      const res = await api.post('/auth/login', { accountId, password, portal: 'barangay' });
      const { token, refreshToken, user } = res.data;
      if (user?.role !== 'barangay') {
        setError('This portal is for barangay accounts only.');
        return;
      }
      onLoggedIn(token, refreshToken, rememberMe);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={d.login.root}>
      <div className={d.login.layout}>
        <section className={d.login.left}>
          <p className={d.login.overline}>Barangay Portal Access</p>
          <h1 className={d.login.title}>WELCOME BACK!</h1>
          <p className={d.login.subtitle}>
            Sign in to your barangay account to monitor incidents and status within your jurisdiction.
          </p>

          <form onSubmit={onSubmit} className={d.login.form}>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value.toUpperCase())}
              placeholder="Barangay ID (BRG-YYYY-00000)"
              className={d.login.input}
              autoComplete="username"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className={d.login.input}
              autoComplete="current-password"
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
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </form>
        </section>

        <section className={d.login.right}>
          <img src={bangaPhoto} alt="Calamba" className={d.login.heroImg} />
          <div className={d.login.overlay} />
          <div className={d.login.heroBody}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.login.seal} />
            <h2 className={d.login.heroTitle}>
              City Disaster Risk Reduction and Management Department
            </h2>
            <p style={{ marginTop: 8, fontSize: '0.9rem', opacity: 0.85 }}>
              Calamba City, Laguna
            </p>
            <p style={{ marginTop: 6, fontSize: '0.78rem', opacity: 0.7 }}>
              Barangay Operations Portal
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
