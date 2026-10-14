import { useCallback, useEffect, useRef, useState } from 'react';
import { d } from '../adminDesign';

export type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
};

type ConfirmationRequest = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmationDialog() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const requestRef = useRef<ConfirmationRequest | null>(null);

  useEffect(() => () => requestRef.current?.resolve(false), []);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    requestRef.current?.resolve(false);
    const nextRequest = { ...options, resolve };
    requestRef.current = nextRequest;
    setRequest(nextRequest);
  }), []);

  const finish = useCallback((confirmed: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(confirmed);
  }, []);

  const confirmationDialog = request ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h3 id="confirmation-title" className="text-lg font-black text-[#1a3650]">{request.title}</h3>
        <p id="confirmation-message" className="mt-2 text-sm leading-5 text-slate-600">{request.message}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => finish(false)} className={d.btn.secondary}>Cancel</button>
          <button type="button" onClick={() => finish(true)} className={request.tone === 'danger' ? d.btn.danger : d.btn.primary}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmationDialog };
}
