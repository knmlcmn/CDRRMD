import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  image: string;
  residentName: string;
  createdAt: string;
  onClose: () => void;
};

export default function RescueImagePreview({ image, residentName, createdAt, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="rescue-image-preview"
      aria-label={`Submitted rescue image from ${residentName}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rescue-image-preview-frame">
        <img src={image} alt={`Rescue proof submitted by ${residentName}`} />
        <time dateTime={createdAt}>{new Date(createdAt).toLocaleString()}</time>
      </div>
      <button type="button" className="rescue-image-preview-close" onClick={onClose} aria-label="Close image preview">×</button>
    </dialog>,
    document.body,
  );
}
