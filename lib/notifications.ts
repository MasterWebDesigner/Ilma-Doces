import { create } from "zustand";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "order" | "info" | "success" | "error";
  createdAt: number;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "createdAt">) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (n) =>
    set((s) => ({
      notifications: [
        {
          ...n,
          id: "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          createdAt: Date.now(),
        },
        ...s.notifications,
      ],
    })),

  dismiss: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}));

export function notifyError(title: string, message: string) {
  useNotificationStore.getState().addNotification({ title, message, type: "error" });
  console.error(`${title}: ${message}`);
}

export function notifySuccess(title: string, message: string) {
  useNotificationStore.getState().addNotification({ title, message, type: "success" });
}

export function notifyInfo(title: string, message: string) {
  useNotificationStore.getState().addNotification({ title, message, type: "info" });
}

export function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore if audio not available
  }
}
