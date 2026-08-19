import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

/** Diálogos globales de la aplicación. */
export type ModalName = 'new-conversation' | 'saved-messages' | 'custom-status' | null;

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface UIState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;

  /**
   * Diálogos que se pueden abrir desde varios sitios (la lista, el paleta de
   * comandos, un atajo). Viven aquí para que no dependan de quién los invoca.
   */
  modal: ModalName;
  openModal: (name: Exclude<ModalName, null>) => void;
  closeModal: () => void;

  /** Perfil abierto en el panel flotante, por @usuario. */
  profileUsername: string | null;
  openProfile: (username: string) => void;
  closeProfile: () => void;

  /** En móvil solo cabe un panel: se recuerda cuál está delante. */
  mobilePane: 'list' | 'content';
  setMobilePane: (pane: 'list' | 'content') => void;

  confirmRequest: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
}

let toastId = 0;

export const useUI = create<UIState>((set, get) => ({
  toasts: [],

  pushToast(toast) {
    const id = `toast-${++toastId}`;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    window.setTimeout(() => get().dismissToast(id), toast.kind === 'error' ? 7000 : 4000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  searchOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  modal: null,
  openModal: (name) => set({ modal: name, searchOpen: false }),
  closeModal: () => set({ modal: null }),

  profileUsername: null,
  openProfile: (username) => set({ profileUsername: username, searchOpen: false }),
  closeProfile: () => set({ profileUsername: null }),

  mobilePane: 'list',
  setMobilePane: (pane) => set({ mobilePane: pane }),

  confirmRequest: null,
  confirm(request) {
    return new Promise<boolean>((resolve) => {
      set({ confirmRequest: { ...request, resolve } });
    });
  },
  resolveConfirm(ok) {
    const request = get().confirmRequest;
    request?.resolve(ok);
    set({ confirmRequest: null });
  },
}));

/** Atajo para reportar errores de forma consistente. */
export function toastError(err: unknown, fallback = 'Algo no ha salido bien') {
  const message = err instanceof Error && err.message ? err.message : fallback;
  useUI.getState().pushToast({ kind: 'error', title: message });
}

export function toastOk(title: string, description?: string) {
  useUI.getState().pushToast({ kind: 'success', title, description });
}
