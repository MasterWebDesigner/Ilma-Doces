import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assinarComRetry } from "@/lib/retrySnapshot";
import { useNotificationStore } from "@/lib/notifications";

function notificacoes() {
  return useNotificationStore.getState().notifications;
}

describe("assinarComRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.setState({ notifications: [] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("avisa na primeira falha, reassina e avisa a recuperacao", () => {
    let aoFalhar: ((e: Error) => void) | null = null;
    let assinaturas = 0;
    const cancelar = assinarComRetry("produtos teste", (falha) => {
      assinaturas += 1;
      aoFalhar = falha;
      return () => {};
    });

    expect(assinaturas).toBe(1);

    aoFalhar!(new Error("permission-denied"));
    expect(
      notificacoes().some((n) => n.type === "error" && n.message.includes("produtos teste"))
    ).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(assinaturas).toBe(2);

    vi.advanceTimersByTime(5000);
    expect(
      notificacoes().some((n) => n.type === "info" && n.message.includes("produtos teste"))
    ).toBe(true);

    cancelar();
  });

  it("so avisa erro uma vez por rotulo mesmo com falhas repetidas", () => {
    let aoFalhar: ((e: Error) => void) | null = null;
    let assinaturas = 0;
    const cancelar = assinarComRetry("credores teste", (falha) => {
      assinaturas += 1;
      aoFalhar = falha;
      return () => {};
    });

    aoFalhar!(new Error("permission-denied"));
    vi.advanceTimersByTime(5000);
    aoFalhar!(new Error("permission-denied"));
    vi.advanceTimersByTime(10000);
    aoFalhar!(new Error("permission-denied"));

    const erros = notificacoes().filter((n) => n.type === "error");
    expect(erros).toHaveLength(1);
    expect(assinaturas).toBe(3);

    cancelar();
  });

  it("cancelar impede novas tentativas", () => {
    let aoFalhar: ((e: Error) => void) | null = null;
    let assinaturas = 0;
    const cancelar = assinarComRetry("clientes teste", (falha) => {
      assinaturas += 1;
      aoFalhar = falha;
      return () => {};
    });

    cancelar();
    aoFalhar!(new Error("permission-denied"));
    vi.advanceTimersByTime(120000);

    expect(assinaturas).toBe(1);
    expect(notificacoes()).toHaveLength(0);
  });
});
