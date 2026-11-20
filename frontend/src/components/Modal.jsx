import { useEffect, useRef } from 'react';

export function Modal({ open, onClose, titleId, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={className} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
    {children}
  </dialog>;
}
