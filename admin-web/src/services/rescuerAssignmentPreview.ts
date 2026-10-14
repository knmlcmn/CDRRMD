import { useCallback, useEffect, useState } from 'react';
import { api } from './apiClient';

export type RescuerAssignment = {
  rescuerId: number;
  rescuerName: string;
  rescuerAccountId: string;
  distanceKm: number | null;
  barangayName: string;
  latitude: number | null;
  longitude: number | null;
};

export type RescuerAssignmentPreview = {
  reportNotes?: string | null;
  barangayNotes?: string | null;
  rescuer: RescuerAssignment | null;
};

type PreviewError = { response?: { status?: number; data?: { message?: string } } };

export function useRescuerAssignmentPreview(url: string | null) {
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = url ? `${url}:${reloadKey}` : null;
  const [result, setResult] = useState<{
    url: string;
    preview: RescuerAssignmentPreview | null;
    error: string;
  } | null>(null);

  const refresh = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    if (!url || !requestKey) return undefined;

    void api.get<RescuerAssignmentPreview>(url)
      .then(({ data }) => {
        if (active) setResult({ url, preview: data, error: '' });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        const apiError = caught as PreviewError;
        setResult({
          url,
          preview: null,
          error: apiError.response?.data?.message || 'Unable to find the nearest available rescuer.',
        });
      });

    return () => { active = false; };
  }, [requestKey, url]);

  useEffect(() => {
    if (!url) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh, url]);

  const isCurrent = Boolean(url && result?.url === url);
  return {
    preview: isCurrent ? result?.preview || null : null,
    loading: Boolean(requestKey) && !isCurrent,
    error: isCurrent ? result?.error || '' : '',
    refresh,
  };
}
