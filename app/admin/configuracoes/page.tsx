"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import {
  type StoreSettings,
  type InstagramPost,
  DEFAULT_SETTINGS,
  getStoreConfig,
  saveStoreConfig,
  makeInstagramPost,
} from "@/lib/storeConfig";

function loadSettings(): StoreSettings {
  return getStoreConfig();
}

export default function AdminConfiguracoes() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [newTimeSlot, setNewTimeSlot] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function handleSave() {
    saveStoreConfig(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function addTimeSlot() {
    if (!newTimeSlot) return;
    if (settings.timeSlots.includes(newTimeSlot)) return;
    setSettings((s) => ({ ...s, timeSlots: [...s.timeSlots, newTimeSlot].sort() }));
    setNewTimeSlot("");
  }

  function removeTimeSlot(slot: string) {
    setSettings((s) => ({ ...s, timeSlots: s.timeSlots.filter((t) => t !== slot) }));
  }

  function addInstagramPost() {
    setSettings((s) => ({
      ...s,
      instagramPosts: [...(s.instagramPosts || []), makeInstagramPost()],
    }));
  }

  function updateInstagramPost(id: string, patch: Partial<InstagramPost>) {
    setSettings((s) => ({
      ...s,
      instagramPosts: (s.instagramPosts || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removeInstagramPost(id: string) {
    setSettings((s) => ({
      ...s,
      instagramPosts: (s.instagramPosts || []).filter((p) => p.id !== id),
    }));
  }

  async function handleClearOrders() {
    if (!confirm("Tem certeza? Todos os pedidos serão removidos do sistema e do banco.")) return;
    try {
      const snap = await getDocs(collection(db, "pedidos"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "pedidos", d.id))));
      localStorage.removeItem("ilma-orders");
      alert("Pedidos limpos com sucesso!");
      window.location.reload();
    } catch (e) {
      alert("Erro ao limpar pedidos: " + e);
    }
  }

  async function handleClearCustomers() {
    if (!confirm("Tem certeza? Todos os clientes serão removidos.")) return;
    try {
      const snap = await getDocs(collection(db, "clientes"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "clientes", d.id))));
      localStorage.removeItem("ilma-customers");
      alert("Clientes limpos com sucesso!");
      window.location.reload();
    } catch (e) {
      alert("Erro ao limpar clientes: " + e);
    }
  }

  async function handleClearCredores() {
    if (!confirm("Tem certeza? Todos os credores e fiados serão removidos.")) return;
    try {
      const snap = await getDocs(collection(db, "credores"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "credores", d.id))));
      alert("Credores limpos com sucesso!");
      window.location.reload();
    } catch (e) {
      alert("Erro ao limpar credores: " + e);
    }
  }

  async function handleClearFinanceiro() {
    if (!confirm("Tem certeza? Todo o histórico financeiro e despesas serão removidos.")) return;
    try {
      const snapFin = await getDocs(collection(db, "financeiro"));
      const snapDesp = await getDocs(collection(db, "despesas"));
      await Promise.all([
        ...snapFin.docs.map((d) => deleteDoc(doc(db, "financeiro", d.id))),
        ...snapDesp.docs.map((d) => deleteDoc(doc(db, "despesas", d.id))),
      ]);
      localStorage.removeItem("ilma-financeiro-store");
      alert("Financeiro limpo com sucesso!");
      window.location.reload();
    } catch (e) {
      alert("Erro ao limpar financeiro: " + e);
    }
  }

  async function handleClearAll() {
    if (!confirm("⚠️ ATENÇÃO: Deseja apagar TUDO do sistema (Pedidos, Clientes, Credores, Financeiro e Despesas)? Esta ação é irreversível!")) return;
    try {
      const [snapPed, snapCli, snapCred, snapFin, snapDesp] = await Promise.all([
        getDocs(collection(db, "pedidos")),
        getDocs(collection(db, "clientes")),
        getDocs(collection(db, "credores")),
        getDocs(collection(db, "financeiro")),
        getDocs(collection(db, "despesas")),
      ]);
      await Promise.all([
        ...snapPed.docs.map((d) => deleteDoc(doc(db, "pedidos", d.id))),
        ...snapCli.docs.map((d) => deleteDoc(doc(db, "clientes", d.id))),
        ...snapCred.docs.map((d) => deleteDoc(doc(db, "credores", d.id))),
        ...snapFin.docs.map((d) => deleteDoc(doc(db, "financeiro", d.id))),
        ...snapDesp.docs.map((d) => deleteDoc(doc(db, "despesas", d.id))),
      ]);
      localStorage.clear();
      alert("Sistema limpo com sucesso!");
      window.location.reload();
    } catch (e) {
      alert("Erro ao limpar sistema: " + e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuracoes</h1>
          <p className="mt-1 text-sm text-neutral-400">Gerencie as configuracoes da loja.</p>
        </div>
        <button
          onClick={handleSave}
          className="rounded-lg bg-wine-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600 hover:shadow-xl"
        >
          {saved ? "Salvo!" : "Salvar Alteracoes"}
        </button>
      </div>

      {/* Dados da Loja */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-300">
          <svg className="h-4 w-4 text-wine-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          Dados da Loja
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome da Loja</label>
            <input type="text" value={settings.storeName} onChange={(e) => setSettings((s) => ({ ...s, storeName: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">WhatsApp da Loja</label>
            <input type="text" value={settings.storePhone} onChange={(e) => setSettings((s) => ({ ...s, storePhone: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="11930657871" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Endereco</label>
            <input type="text" value={settings.storeAddress} onChange={(e) => setSettings((s) => ({ ...s, storeAddress: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Rua, numero, bairro" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Instagram</label>
            <input type="text" value={settings.storeInstagram} onChange={(e) => setSettings((s) => ({ ...s, storeInstagram: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="@ilmadoces" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Link Google Maps</label>
            <input type="text" value={settings.googleMapsLink} onChange={(e) => setSettings((s) => ({ ...s, googleMapsLink: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="https://maps.google.com/..." />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Mensagem de Boas-Vindas</label>
          <textarea value={settings.welcomeMessage} onChange={(e) => setSettings((s) => ({ ...s, welcomeMessage: e.target.value }))} rows={2} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500 resize-none" placeholder="Mensagem exibida no inicio do cardapio..." />
        </div>
      </div>

      {/* Entrega e Horarios */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-300">
          <svg className="h-4 w-4 text-wine-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Entrega e Horarios
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Taxa de Entrega (R$)</label>
            <input type="number" step="0.01" min="0" value={settings.deliveryFee} onChange={(e) => setSettings((s) => ({ ...s, deliveryFee: parseFloat(e.target.value) || 0 }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Antecedencia Minima (horas)</label>
            <input type="number" min="1" value={settings.minAdvanceHours} onChange={(e) => setSettings((s) => ({ ...s, minAdvanceHours: parseInt(e.target.value) || 24 }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Horario de Abertura</label>
            <input type="time" value={settings.openingHour} onChange={(e) => setSettings((s) => ({ ...s, openingHour: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Horario de Fechamento</label>
            <input type="time" value={settings.closingHour} onChange={(e) => setSettings((s) => ({ ...s, closingHour: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
          </div>
        </div>

        {/* Time Slots */}
        <div className="mt-4">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Horarios de Entrega/Retirada</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {settings.timeSlots.map((slot) => (
              <span key={slot} className="flex items-center gap-1.5 rounded-full border border-wine-500/30 bg-wine-500/10 px-3 py-1 text-xs font-semibold text-wine-400">
                {slot}
                <button onClick={() => removeTimeSlot(slot)} className="ml-0.5 text-wine-400/60 hover:text-wine-400">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="time" value={newTimeSlot} onChange={(e) => setNewTimeSlot(e.target.value)} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
            <button onClick={addTimeSlot} className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-400 transition-colors hover:border-wine-500 hover:bg-wine-500/10 hover:text-wine-400">
              + Adicionar
            </button>
          </div>
        </div>
      </div>

      {/* Pagamento */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-300">
          <svg className="h-4 w-4 text-wine-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
          Pagamento
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Chave PIX</label>
            <input type="text" value={settings.pixKey} onChange={(e) => setSettings((s) => ({ ...s, pixKey: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="CPF, e-mail, celular ou chave aleatoria" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Descricao PIX</label>
            <input type="text" value={settings.pixDescription} onChange={(e) => setSettings((s) => ({ ...s, pixDescription: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: Chave PIX da loja" />
          </div>
        </div>
      </div>

      {/* Posts do Instagram */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-300">
            <span aria-hidden>📸</span>
            Posts do Instagram
          </h2>
          <button
            onClick={addInstagramPost}
            className="rounded-lg border border-wine-500/40 bg-wine-500/10 px-4 py-2 text-xs font-semibold text-wine-400 transition-colors hover:bg-wine-500/20"
          >
            + Adicionar Post
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Gerencie os posts exibidos na seção &quot;Siga no Instagram&quot; da landing page (4 a 8 itens ativos recomendados).
        </p>
        {(settings.instagramPosts || []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-700 px-4 py-8 text-center text-xs text-neutral-500">
            Nenhum post cadastrado. Clique em &quot;+ Adicionar Post&quot;.
          </p>
        ) : (
          <div className="space-y-3">
            {(settings.instagramPosts || []).map((post, index) => (
              <div key={post.id} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-neutral-300">
                    <input
                      type="checkbox"
                      checked={post.active}
                      onChange={(e) => updateInstagramPost(post.id, { active: e.target.checked })}
                      className="h-4 w-4 accent-wine-500"
                    />
                    {post.active ? "Visível na landing" : "Oculto"}
                    <span className="text-neutral-600">#{index + 1}</span>
                  </label>
                  <button
                    onClick={() => removeInstagramPost(post.id)}
                    className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
                  >
                    Remover
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Título / Legenda (opcional)</label>
                    <input
                      type="text"
                      value={post.title}
                      onChange={(e) => updateInstagramPost(post.id, { title: e.target.value })}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                      placeholder="Ex: Bolo de chocolate da casa"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Link do Post / Reel</label>
                    <input
                      type="url"
                      value={post.url}
                      onChange={(e) => updateInstagramPost(post.id, { url: e.target.value })}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                      placeholder="https://www.instagram.com/p/CODE"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Imagem / Capa</label>
                    <input
                      type="url"
                      value={post.imageUrl}
                      onChange={(e) => updateInstagramPost(post.id, { imageUrl: e.target.value })}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                      placeholder="https://... ou /imagens/..."
                    />
                  </div>
                </div>
                {post.imageUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                      <img src={post.imageUrl} alt={post.title || "Prévia"} className="h-full w-full object-cover" />
                    </div>
                    <p className="text-[10px] text-neutral-500">Prévia da capa do post</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona de Perigo */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          Zona de Perigo
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Limpar Todos os Pedidos</p>
              <p className="text-xs text-neutral-500">Remove todos os pedidos do sistema e banco.</p>
            </div>
            <button
              onClick={handleClearOrders}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
            >
              Limpar Pedidos
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Limpar Todos os Clientes</p>
              <p className="text-xs text-neutral-500">Remove todos os clientes cadastrados.</p>
            </div>
            <button
              onClick={handleClearCustomers}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
            >
              Limpar Clientes
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Limpar Todos os Credores</p>
              <p className="text-xs text-neutral-500">Remove todos os credores e fiados.</p>
            </div>
            <button
              onClick={handleClearCredores}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
            >
              Limpar Credores
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Limpar Financeiro e Despesas</p>
              <p className="text-xs text-neutral-500">Remove todo o histórico financeiro e despesas.</p>
            </div>
            <button
              onClick={handleClearFinanceiro}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20"
            >
              Limpar Caixa
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 p-4">
            <div>
              <p className="text-sm font-bold text-red-400">APAGAR TUDO DO SISTEMA</p>
              <p className="text-xs text-red-300/80">Zera completamente pedidos, clientes, credores e financeiro.</p>
            </div>
            <button
              onClick={handleClearAll}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 shadow-lg shadow-red-600/30"
            >
              Zerar Sistema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
