import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './BackupModal.css';

export default function BackupModal({ title, children, onClose, square = false, variant = 'default' }: {
  title: string; children: ReactNode; onClose: () => void; square?: boolean; variant?: 'default' | 'rescue-request';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return createPortal(
    <dialog ref={ref} className={`backup-modal ${square ? 'backup-modal-square' : ''} ${variant === 'rescue-request' ? 'backup-modal-rescue-request' : ''}`}
      aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {variant === 'default' ? <h2>{title}</h2> : null}
      {children}
    </dialog>,
    document.body,
  );
}
