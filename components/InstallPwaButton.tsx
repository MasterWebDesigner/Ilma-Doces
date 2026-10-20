"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPwaButton({
  variant = "pill",
  iconOnly = false,
}: {
  variant?: "pill" | "sidebar";
  iconOnly?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);

    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIos) setVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      setDeferred(null);
    }
  }

  if (!visible || installed) return null;

  const classes =
    variant === "sidebar"
      ? "mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
      : "rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-80";

  return (
    <>
      <button
        onClick={() => (deferred ? handleInstall() : setShowIosHelp((v) => !v))}
        title={variant === "sidebar" && iconOnly ? "Instalar App" : undefined}
        className={classes}
      >
        {variant === "sidebar" && (
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        {!(variant === "sidebar" && iconOnly) && "Instalar App"}
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowIosHelp(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white">Instalar no iPhone/iPad</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-neutral-300">
              <li>Toque no botão <span className="font-bold text-white">Compartilhar</span> (quadrado com seta para cima) na barra do Safari.</li>
              <li>Role para baixo e toque em <span className="font-bold text-white">Adicionar à Tela de Início</span>.</li>
              <li>Confirme em <span className="font-bold text-white">Adicionar</span> e pronto — o app abre em tela cheia.</li>
            </ol>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-4 w-full rounded-lg bg-wine-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-wine-600"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
