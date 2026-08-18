import { useUI } from '@/store/ui';
import { Button } from './Button';
import { Modal } from './Modal';

/** Confirmación global: cualquier acción irreversible pasa por aquí. */
export function ConfirmDialog() {
  const request = useUI((state) => state.confirmRequest);
  const resolve = useUI((state) => state.resolveConfirm);

  if (!request) return null;

  return (
    <Modal
      open
      onClose={() => resolve(false)}
      title={request.title}
      description={request.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => resolve(false)}>
            {request.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            variant={request.danger ? 'danger' : 'primary'}
            onClick={() => resolve(true)}
            autoFocus
          >
            {request.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <span />
    </Modal>
  );
}
