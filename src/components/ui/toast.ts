import { create } from 'zustand';

export type Toast = { id: number; message: string; tone?: 'info' | 'warning' | 'error' | 'success' };

type ToastState = {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone'], ttlMs?: number) => void;
  dismiss: (id: number) => void;
};

let seq = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, tone = 'info', ttlMs = 5000) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    if (ttlMs > 0) setTimeout(() => get().dismiss(id), ttlMs);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, tone?: Toast['tone'], ttlMs?: number) =>
  useToastStore.getState().push(message, tone, ttlMs);
