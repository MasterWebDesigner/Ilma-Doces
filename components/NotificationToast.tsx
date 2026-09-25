"use client";

import { useEffect } from "react";
import { useNotificationStore } from "@/lib/notifications";

export default function NotificationToast() {
  const { notifications, dismiss } = useNotificationStore();

  useEffect(() => {
    if (notifications.length === 0) return;
    const timers = notifications.map((n) =>
      setTimeout(() => dismiss(n.id), 6000)
    );
    return () => timers.forEach(clearTimeout);
  }, [notifications, dismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {notifications.slice(0, 3).map((n) => (
        <div
          key={n.id}
          className="animate-slide-in rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm ${
              n.type === "error" ? "bg-red-500/15 text-red-400" :
              n.type === "success" ? "bg-emerald-500/15 text-emerald-400" :
              n.type === "order" ? "bg-blue-500/15 text-blue-400" :
              "bg-neutral-500/15 text-neutral-400"
            }`}>
              {n.type === "error" ? "✕" : n.type === "order" ? "🛒" : n.type === "success" ? "✓" : "ℹ"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{n.title}</p>
              <p className="mt-0.5 text-xs text-neutral-400 truncate">{n.message}</p>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
