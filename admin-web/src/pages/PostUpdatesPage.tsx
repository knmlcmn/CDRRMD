import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { AlertItem, AnnouncementItem } from '../types';

function alertLevelLabel(category: string, severity: string) {
  if (category === 'typhoon' && severity.startsWith('signal_')) {
    return `Signal No. ${severity.slice('signal_'.length)}`;
  }
  return severity;
}

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenHistory: () => void;
  onAuthError: () => void;
};

export default function PostUpdatesPage({
  onLogout,
  onOpenDashboard,
  onOpenAdmin,
  onOpenUsers,
  onOpenBarangay,
  onOpenRescuers,
  onOpenMonitoring,
  onOpenFloodMonitoring,
  onOpenEvacuationAreas,
  onOpenHistory,
  onAuthError,
}: Props) {
  const [alertTitle, setAlertTitle] = useState('');
  const [alertBody, setAlertBody] = useState('');
  const [alertCategory, setAlertCategory] = useState('typhoon');
  const [alertLevel, setAlertLevel] = useState('signal_1');

  const [newsTitle, setNewsTitle] = useState('');
  const [newsBody, setNewsBody] = useState('');

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUpdates(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [alertsResponse, announcementsResponse] = await Promise.all([
        api.get('/content/alerts'),
        api.get('/content/announcements'),
      ]);
      setAlerts(Array.isArray(alertsResponse.data) ? alertsResponse.data : []);
      setAnnouncements(Array.isArray(announcementsResponse.data) ? announcementsResponse.data : []);
      setError(null);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load updates.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadUpdates(true).catch(() => {});
  }, []);

  async function submitAlert(event: FormEvent) {
    event.preventDefault();
    if (posting) {
      return;
    }

    setPosting(true);
    setError(null);

    try {
      await api.post('/content/alerts', {
        title: alertTitle,
        body: alertBody,
        category: alertCategory,
        severity: alertLevel,
      });
      setAlertTitle('');
      setAlertBody('');
      await loadUpdates(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to post alert.');
    } finally {
      setPosting(false);
    }
  }

  async function submitNews(event: FormEvent) {
    event.preventDefault();
    if (posting) {
      return;
    }

    setPosting(true);
    setError(null);

    try {
      await api.post('/content/announcements', {
        title: newsTitle,
        body: newsBody,
      });
      setNewsTitle('');
      setNewsBody('');
      await loadUpdates(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to post announcement.');
    } finally {
      setPosting(false);
    }
  }

  const recentItems = useMemo(() => {
    const alertRows = alerts.slice(0, 8).map((item) => ({
      id: `alert-${item.id}`,
      kind: 'Alert',
      title: item.title,
      body: item.body,
      createdAt: item.created_at,
      tags: [
        item.category || 'general',
        alertLevelLabel(item.category, item.severity || 'medium'),
      ],
    }));

    const announcementRows = announcements.slice(0, 8).map((item) => ({
      id: `announcement-${item.id}`,
      kind: 'Announcement',
      title: item.title,
      body: item.body,
      createdAt: item.created_at,
      tags: [],
    }));

    return [...alertRows, ...announcementRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 16);
  }, [alerts, announcements]);

  return (
    <AdminShell
      activeView="post-updates"
      title="Post Updates"
      subtitle="Publish Latest Alerts and News & Announcements"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
        onOpenRescuers={onOpenRescuers}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={() => {}}
      onOpenHistory={onOpenHistory}
    >
      <div className={d.postUpdates.root}>
        {error ? <div className={d.page.error}>{error}</div> : null}

        <section className={d.postUpdates.grid}>
          <article className={d.postUpdates.composeCard}>
            <h3 className={d.postUpdates.cardTitle}>Post Latest Alert</h3>
            <p className={d.postUpdates.cardSub}>Use this for urgent hazard notices and operational warnings.</p>
            <form onSubmit={submitAlert}>
              <input
                value={alertTitle}
                onChange={(event) => setAlertTitle(event.target.value)}
                placeholder="Alert title"
                className={d.form.input}
                required
              />
              <textarea
                value={alertBody}
                onChange={(event) => setAlertBody(event.target.value)}
                placeholder="Alert details"
                className={d.form.textarea}
                required
              />
              <div className={d.postUpdates.twoCol}>
                <select
                  aria-label="Alert category"
                  value={alertCategory}
                  onChange={(event) => {
                    const category = event.target.value;
                    setAlertCategory(category);
                    setAlertLevel(category === 'typhoon' ? 'signal_1' : 'medium');
                  }}
                  className={d.form.select}
                >
                  <option value="typhoon">Typhoon</option>
                  <option value="flood">Flood</option>
                </select>
                <select
                  aria-label={alertCategory === 'typhoon' ? 'Calamba storm signal number' : 'Flood severity'}
                  value={alertLevel}
                  onChange={(event) => setAlertLevel(event.target.value)}
                  className={d.form.select}
                >
                  {alertCategory === 'typhoon' ? (
                    <>
                      <option value="signal_1">Signal No. 1</option>
                      <option value="signal_2">Signal No. 2</option>
                      <option value="signal_3">Signal No. 3</option>
                      <option value="signal_4">Signal No. 4</option>
                      <option value="signal_5">Signal No. 5</option>
                    </>
                  ) : (
                    <>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </>
                  )}
                </select>
              </div>
              <div className={d.postUpdates.submitRow}>
                <button className={d.btn.dangerMt2} disabled={posting}>Publish Alert</button>
              </div>
            </form>

            <h3 className={d.postUpdates.cardTitle}>Post News & Announcement</h3>
            <p className={d.postUpdates.cardSub}>Share advisories, updates, and official public notices.</p>
            <form onSubmit={submitNews}>
              <input
                value={newsTitle}
                onChange={(event) => setNewsTitle(event.target.value)}
                placeholder="News title"
                className={d.form.input}
                required
              />
              <textarea
                value={newsBody}
                onChange={(event) => setNewsBody(event.target.value)}
                placeholder="Announcement details"
                className={d.form.textarea}
                required
              />
              <div className={d.postUpdates.submitRow}>
                <button className={d.btn.primaryMt2} disabled={posting}>Publish News</button>
              </div>
            </form>
          </article>

          <article className={d.postUpdates.feedCard}>
            <h3 className={d.postUpdates.feedTitle}>Latest Published Updates</h3>
            <div className={d.postUpdates.feedList}>
              {recentItems.length === 0 ? (
                <p className={d.page.loading}>No updates posted yet.</p>
              ) : recentItems.map((item) => (
                <article key={item.id} className={d.postUpdates.feedItem}>
                  <div className={d.postUpdates.feedHeader}>
                    <p className={d.postUpdates.feedHeadline}>{item.title}</p>
                    <p className={d.postUpdates.feedMeta}>{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <div className={d.postUpdates.feedBadgeRow}>
                    <span className={d.postUpdates.feedBadge}>{item.kind}</span>
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className={d.postUpdates.feedBadge}>{String(tag).toUpperCase()}</span>
                    ))}
                  </div>
                  <p className={d.postUpdates.feedBody}>{item.body}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        {loading ? <p className={d.page.loading}>Loading posted updates...</p> : null}
      </div>
    </AdminShell>
  );
}
