import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore } from "@/lib/notifications";

describe("useNotificationStore", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it("adds a notification", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ title: "Test", message: "Test message", type: "info" });

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Test");
    expect(notifications[0].type).toBe("info");
  });

  it("dismisses a notification", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ title: "Test", message: "Test message", type: "success" });

    const { notifications, dismiss } = useNotificationStore.getState();
    const id = notifications[0].id;
    dismiss(id);

    const { notifications: updated } = useNotificationStore.getState();
    expect(updated).toHaveLength(0);
  });

  it("clears all notifications", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ title: "Test 1", message: "Message 1", type: "info" });
    addNotification({ title: "Test 2", message: "Message 2", type: "error" });

    const { clearAll } = useNotificationStore.getState();
    clearAll();

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(0);
  });
});
