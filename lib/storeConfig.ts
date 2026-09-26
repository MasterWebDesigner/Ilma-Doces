"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

export interface InstagramPost {
  id: string;
  active: boolean;
  title: string;
  url: string;
  imageUrl: string;
}

export interface StoreSettings {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  storeInstagram: string;
  deliveryFee: number;
  minAdvanceHours: number;
  timeSlots: string[];
  openingHour: string;
  closingHour: string;
  pixKey: string;
  pixDescription: string;
  welcomeMessage: string;
  googleMapsLink: string;
  brindeAtivo: boolean;
  valorMinimoBrinde: number;
  brindeCategoriaId: string;
  brindeTodasCategorias: boolean;
  brindeCategoriasPromo: string[];
  instagramPosts: InstagramPost[];
}

export function makeInstagramPost(partial?: Partial<InstagramPost>): InstagramPost {
  return {
    id: `ig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    active: true,
    title: "",
    url: "",
    imageUrl: "",
    ...partial,
  };
}

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "Ilma Doces",
  storePhone: "11930657871",
  storeAddress: "Rua das Flores, 123 - Centro, Sao Paulo, SP - CEP 01234-567",
  storeInstagram: "@ilmadoces",
  deliveryFee: 8,
  minAdvanceHours: 24,
  timeSlots: ["10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  openingHour: "09:00",
  closingHour: "18:00",
  pixKey: "",
  pixDescription: "Chave PIX da loja",
  welcomeMessage: "Ola! Bem-vindo(a) a Ilma Doces!",
  googleMapsLink: "",
  brindeAtivo: true,
  valorMinimoBrinde: 80,
  brindeCategoriaId: "",
  brindeTodasCategorias: true,
  brindeCategoriasPromo: [],
  instagramPosts: [
    makeInstagramPost({ title: "Bolo de chocolate da casa", imageUrl: "/imagens/BoloChocolate.webp", active: true }),
    makeInstagramPost({ title: "Bolo de cenoura com cobertura", imageUrl: "/imagens/BoloChocolateCenoura.webp", active: true }),
    makeInstagramPost({ title: "Torta salgada artesanal", imageUrl: "/imagens/TortaDeFrango.webp", active: true }),
    makeInstagramPost({ title: "Gelinhos gourmet da semana", imageUrl: "/imagens/Maionese.webp", active: true }),
  ],
};

const STORAGE_KEY = "ilma-store-settings";
export const SETTINGS_CHANGED_EVENT = "ilma-store-settings-changed";

if (typeof window !== "undefined") {
  onSnapshot(
    doc(db, "configuracoes", "loja"),
    (snap) => {
      if (!snap.exists()) return;
      try {
        const remote = { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<StoreSettings>) };
        const raw = localStorage.getItem(STORAGE_KEY);
        const local = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
        if (JSON.stringify(local) === JSON.stringify(remote)) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      } catch {}
    },
    () => {}
  );
}

export function getStoreConfig(): StoreSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveStoreConfig(settings: StoreSettings): void {
  if (typeof window === "undefined") return;
  const normalized: StoreSettings = {
    ...settings,
    brindeTodasCategorias: settings.brindeTodasCategorias !== false,
    brindeCategoriasPromo: Array.isArray(settings.brindeCategoriasPromo)
      ? settings.brindeCategoriasPromo
      : [],
    instagramPosts: Array.isArray(settings.instagramPosts)
      ? settings.instagramPosts
      : DEFAULT_SETTINGS.instagramPosts,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  try {
    setDoc(doc(db, "configuracoes", "loja"), normalized, { merge: true });
  } catch {}
}

export async function loadStoreConfigFromDb(): Promise<StoreSettings | null> {
  try {
    const snap = await getDoc(doc(db, "configuracoes", "loja"));
    if (snap.exists()) {
      return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<StoreSettings>) };
    }
  } catch {}
  return null;
}

export function getWhatsAppPhone(): string {
  return `55${getStoreConfig().storePhone.replace(/\D/g, "")}`;
}

export function useStoreConfig(): StoreSettings {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(getStoreConfig());

    loadStoreConfigFromDb().then((dbSettings) => {
      if (dbSettings) {
        const merged = { ...DEFAULT_SETTINGS, ...dbSettings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        setSettings(merged);
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      }
    });

    function refresh() {
      setSettings(getStoreConfig());
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) refresh();
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
    };
  }, []);

  return settings;
}
