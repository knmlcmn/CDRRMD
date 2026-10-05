import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './BackupModal.css';

export default function BackupModal({ title, children, onClose, square = false }: {
  title: string; children: ReactNode; onClose: () => void; square?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return createPortal(
    <dialog ref={ref} className={`backup-modal ${square ? 'backup-modal-square' : ''}`}
      aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}
