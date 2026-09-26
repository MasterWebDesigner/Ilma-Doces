"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCredoresStore } from "@/lib/credoresStore";
import type { Credor, CompraCredor, CompraItem, PagamentoCredor } from "@/types/database";
import { useCustomerStore, useProductStore, useOrderStore } from "@/lib/store";
import { getLocalDateStr, paymentLabelOf } from "@/lib/utils";
import { formatarTelefone } from "@/lib/phone";

interface ItemCarrinho {
  id: string;
  tipo: "catalogo" | "custom";
  produtoId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

type TabCredor = "em_aberto" | "quitados";
type OrdenacaoCredor = "antigos" | "maior_valor" | "recentes" | "vencimento";

export default function CredoresPage() {
  const {
    credores,
    adicionarCredor,
    editarCredor,
    removerCredor,
    adicionarCompra,
    editarCompra,
    removerCompra,
    registrarBaixaCompra,
    removerPagamento,
  } = useCredoresStore();
  const customers = useCustomerStore((s) => s.customers);
  const products = useProductStore((s) => s.products);
  const orders = useOrderStore((s) => s.orders);

  function getOrderBadge(referenciaId?: string) {
    if (!referenciaId) return null;
    const ord = orders.find((o) => o.id === referenciaId);
    const num = ord?.orderNumber || referenciaId.slice(-6);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-wine-500/15 border border-wine-500/30 px-2.5 py-0.5 text-[10px] font-bold text-wine-400">
        🏷️ Pedido #{num}
      </span>
    );
  }

  const [busca, setBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<TabCredor>("em_aberto");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoCredor>("antigos");

  const [modalCredorOpen, setModalCredorOpen] = useState(false);
  const [credorEditando, setCredorEditando] = useState<Credor | null>(null);

  // Form credor
  const [clienteId, setClienteId] = useState("");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Carrinho no modal Novo Credor
  const [itensCarrinho, setItensCarrinho] = useState<ItemCarrinho[]>([]);
  const [tipoAtual, setTipoAtual] = useState<"catalogo" | "custom">("catalogo");
  const [prodAtualId, setProdAtualId] = useState("");
  const [qtdAtual, setQtdAtual] = useState(1);
  const [descAtual, setDescAtual] = useState("");
  const [valorAtual, setValorAtual] = useState("");

  const [dataCompra, setDataCompra] = useState(getLocalDateStr());
  const [dataPrometida, setDataPrometida] = useState(
    (() => { const d = new Date(); d.setDate(d.getDate() + 7); return getLocalDateStr(d); })()
  );

  // Modal compra adicional
  const [modalCompraOpen, setModalCompraOpen] = useState(false);
  const [credorSelecionadoId, setCredorSelecionadoId] = useState<string | null>(null);
  const [descCompra, setDescCompra] = useState("");
  const [valorCompra, setValorCompra] = useState("");
  const [compraData, setCompraData] = useState(getLocalDateStr());
  const [compraDataPrometida, setCompraDataPrometida] = useState(
    (() => { const d = new Date(); d.setDate(d.getDate() + 7); return getLocalDateStr(d); })()
  );
  const [compraTipo, setCompraTipo] = useState<"catalogo" | "custom">("catalogo");
  const [compraProdutoId, setCompraProdutoId] = useState("");
  const [compraQtd, setCompraQtd] = useState(1);

  // Modal Editar Compra
  const [modalEditarCompraOpen, setModalEditarCompraOpen] = useState(false);
  const [editCredorId, setEditCredorId] = useState<string | null>(null);
  const [editCompraId, setEditCompraId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editData, setEditData] = useState("");
  const [editDataPrometida, setEditDataPrometida] = useState("");

  // Modal Pagamento / Baixa
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false);
  const [credorPagamentoId, setCredorPagamentoId] = useState<string | null>(null);
  const [comprasSelecionadasBaixaIds, setComprasSelecionadasBaixaIds] = useState<string[]>([]);
  const [valorPagamento, setValorPagamento] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState("PIX");
  const [dataPagamento, setDataPagamento] = useState(getLocalDateStr());
  const [obsPagamento, setObsPagamento] = useState("");

  // Accordion expanded rows
  const [expandedCredores, setExpandedCredores] = useState<Record<string, boolean>>({});

  // Modal Histórico Geral de Entradas
  const [modalHistoricoOpen, setModalHistoricoOpen] = useState(false);

  function toggleExpand(id: string) {
    setExpandedCredores((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Agrupamento estrito e incondicional por Telefone/WhatsApp limpo
  const credoresAgrupados = useMemo(() => {
    const map = new Map<string, {
      id: string;
      clienteId: string;
      nome: string;
      whatsapp: string;
      observacoes?: string;
      compras: CompraCredor[];
      pagamentos: PagamentoCredor[];
    }>();

    credores.forEach((c) => {
      const foneKey = c.whatsapp ? c.whatsapp.replace(/\D/g, "") : "";
      const key = foneKey || c.clienteId || c.nome.toLowerCase().trim();

      if (!map.has(key)) {
        map.set(key, {
          id: c.id,
          clienteId: c.clienteId || key,
          nome: c.nome,
          whatsapp: c.whatsapp,
          observacoes: c.observacoes,
          compras: [...(c.compras || [])],
          pagamentos: [...(c.pagamentos || [])],
        });
      } else {
        const existing = map.get(key)!;
        const comprasIds = new Set(existing.compras.map((comp) => comp.id));
        (c.compras || []).forEach((comp) => {
          if (!comprasIds.has(comp.id)) {
            existing.compras.push(comp);
            comprasIds.add(comp.id);
          }
        });

        const pagamentosIds = new Set(existing.pagamentos.map((p) => p.id));
        (c.pagamentos || []).forEach((p) => {
          if (!pagamentosIds.has(p.id)) {
            existing.pagamentos.push(p);
            pagamentosIds.add(p.id);
          }
        });

        if (c.observacoes && !existing.observacoes) {
          existing.observacoes = c.observacoes;
        }
        // Prefere manter o nome mais completo se houver
        if (c.nome && c.nome.length > existing.nome.length) {
          existing.nome = c.nome;
        }
      }
    });

    return Array.from(map.values());
  }, [credores]);

  function abrirNovoCredor() {
    setCredorEditando(null);
    setClienteId("");
    setNome("");
    setWhatsapp("");
    setObservacoes("");
    setItensCarrinho([]);
    setTipoAtual("catalogo");
    setProdAtualId("");
    setQtdAtual(1);
    setDescAtual("");
    setValorAtual("");
    setDataCompra(getLocalDateStr());
    const d = new Date(); d.setDate(d.getDate() + 7);
    setDataPrometida(getLocalDateStr(d));
    setModalCredorOpen(true);
  }

  function abrirEditarCredor(c: { id: string; clienteId: string; nome: string; whatsapp: string; observacoes?: string }) {
    setCredorEditando(c as Credor);
    setClienteId(c.clienteId || "");
    setNome(c.nome);
    setWhatsapp(c.whatsapp);
    setObservacoes(c.observacoes || "");
    setModalCredorOpen(true);
  }

  function adicionarItemAoCarrinho(e: React.FormEvent) {
    e.preventDefault();
    if (tipoAtual === "catalogo") {
      const prod = products.find((p) => p.id === prodAtualId);
      if (!prod) return;
      setItensCarrinho((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          tipo: "catalogo",
          produtoId: prod.id,
          descricao: prod.name,
          quantidade: qtdAtual,
          valorUnitario: prod.price,
        },
      ]);
      setProdAtualId("");
      setQtdAtual(1);
    } else {
      if (!descAtual.trim() || !valorAtual) return;
      const valNum = parseFloat(valorAtual.replace(",", ".")) || 0;
      if (valNum <= 0) return;
      setItensCarrinho((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          tipo: "custom",
          produtoId: "",
          descricao: descAtual.trim(),
          quantidade: qtdAtual,
          valorUnitario: valNum,
        },
      ]);
      setDescAtual("");
      setValorAtual("");
      setQtdAtual(1);
    }
  }

  function removerItemDoCarrinho(id: string) {
    setItensCarrinho((prev) => prev.filter((i) => i.id !== id));
  }

  function atualizarItemCarrinho(id: string, updates: Partial<ItemCarrinho>) {
    setItensCarrinho((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        if (updates.tipo === "catalogo" && updates.produtoId) {
          const prod = products.find((p) => p.id === updates.produtoId);
          if (prod) {
            updated.valorUnitario = prod.price;
            updated.descricao = prod.name;
          }
        }
        return updated;
      })
    );
  }

  const valorTotalCarrinho = itensCarrinho.reduce((acc, item) => {
    const unit = item.tipo === "catalogo" ? (products.find(p => p.id === item.produtoId)?.price || 0) : item.valorUnitario;
    return acc + unit * item.quantidade;
  }, 0);

  function salvarCredor(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !whatsapp.trim()) return;
    const finalClienteId = clienteId || whatsapp.replace(/\D/g, "") || ("cli-" + Date.now());

    if (credorEditando) {
      editarCredor(credorEditando.id, { clienteId: finalClienteId, nome, whatsapp, observacoes });
      setModalCredorOpen(false);
    } else {
      if (itensCarrinho.length === 0) {
        alert("Adicione pelo menos um item à dívida.");
        return;
      }

      const novoCredorId = adicionarCredor({ clienteId: finalClienteId, nome, whatsapp, observacoes });

      const itensFormatados: CompraItem[] = itensCarrinho.map((i) => ({
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitario: i.tipo === "catalogo" ? (products.find((p) => p.id === i.produtoId)?.price || i.valorUnitario) : i.valorUnitario,
      }));

      const descricaoResumo = itensCarrinho.map((i) => `${i.quantidade}x ${i.descricao}`).join(", ");

      adicionarCompra(novoCredorId, {
        origem: "manual",
        descricao: descricaoResumo,
        itens: itensFormatados,
        valor: valorTotalCarrinho,
        data: dataCompra,
        dataPrometida,
      });

      itensCarrinho.forEach((i) => {
        if (i.tipo === "catalogo" && i.produtoId) {
          useProductStore.getState().deductStock(i.produtoId, i.quantidade);
        }
      });

      setModalCredorOpen(false);
      setAbaAtiva("em_aberto");
    }
  }

  function abrirNovaCompra(credorId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCredorSelecionadoId(credorId);
    setDescCompra("");
    setValorCompra("");
    setCompraProdutoId("");
    setCompraQtd(1);
    setCompraTipo("catalogo");
    setCompraData(getLocalDateStr());
    const d = new Date(); d.setDate(d.getDate() + 7);
    setCompraDataPrometida(getLocalDateStr(d));
    setModalCompraOpen(true);
  }

  function salvarCompra(e: React.FormEvent) {
    e.preventDefault();
    if (!credorSelecionadoId) return;

    let descricao = "";
    let valorNum = 0;
    let quantidade = 1;
    let produtoIdParaBaixa = "";

    if (compraTipo === "catalogo") {
      const prod = products.find((p) => p.id === compraProdutoId);
      if (!prod) return;
      descricao = prod.name;
      valorNum = prod.price * compraQtd;
      quantidade = compraQtd;
      produtoIdParaBaixa = prod.id;
    } else {
      if (!descCompra.trim() || !valorCompra) return;
      valorNum = parseFloat(valorCompra.replace(",", "."));
      if (isNaN(valorNum) || valorNum <= 0) return;
      descricao = descCompra.trim();
    }

    adicionarCompra(credorSelecionadoId, {
      origem: "manual",
      descricao,
      itens: [{ descricao, quantidade, valorUnitario: compraTipo === "catalogo" ? (products.find((p) => p.id === compraProdutoId)?.price ?? 0) : valorNum }],
      valor: valorNum,
      data: compraData,
      dataPrometida: compraDataPrometida,
    });

    if (produtoIdParaBaixa) {
      useProductStore.getState().deductStock(produtoIdParaBaixa, quantidade);
    }

    setModalCompraOpen(false);
    setAbaAtiva("em_aberto");
  }

  function abrirEditarCompra(credorId: string, compra: CompraCredor) {
    setEditCredorId(credorId);
    setEditCompraId(compra.id);
    setEditDesc(compra.descricao);
    setEditValor(compra.valor.toFixed(2).replace(".", ","));
    setEditData(compra.data || getLocalDateStr());
    setEditDataPrometida(compra.dataPrometida || getLocalDateStr());
    setModalEditarCompraOpen(true);
  }

  function salvarEdicaoCompra(e: React.FormEvent) {
    e.preventDefault();
    if (!editCredorId || !editCompraId || !editDesc.trim() || !editValor) return;

    const valorNum = parseFloat(editValor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) return;

    editarCompra(editCredorId, editCompraId, {
      descricao: editDesc,
      valor: valorNum,
      data: editData,
      dataPrometida: editDataPrometida,
      itens: [{ descricao: editDesc, quantidade: 1, valorUnitario: valorNum }],
    });

    setModalEditarCompraOpen(false);
  }

  function abrirPagamento(credorId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCredorPagamentoId(credorId);
    const credor = credoresAgrupados.find((c) => c.id === credorId);
    if (credor) {
      const openCompras = (credor.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0);
      if (openCompras.length > 0) {
        setComprasSelecionadasBaixaIds([openCompras[0].id]);
        const pendente = openCompras[0].valorPendente !== undefined ? openCompras[0].valorPendente : openCompras[0].valor;
        setValorPagamento(pendente.toFixed(2).replace(".", ","));
      } else {
        setComprasSelecionadasBaixaIds([]);
        setValorPagamento("");
      }
    } else {
      setComprasSelecionadasBaixaIds([]);
      setValorPagamento("");
    }
    setMetodoPagamento("PIX");
    setDataPagamento(getLocalDateStr());
    setObsPagamento("");
    setModalPagamentoOpen(true);
  }

  function handleSelectCompraBaixa(compraId: string) {
    setComprasSelecionadasBaixaIds((prev) => {
      const next = prev.includes(compraId) ? prev.filter((id) => id !== compraId) : [...prev, compraId];
      const credor = credoresAgrupados.find((c) => c.id === credorPagamentoId);
      if (credor) {
        const totalSelecionado = next.reduce((acc, id) => {
          const compra = (credor.compras || []).find((c) => c.id === id);
          if (!compra) return acc;
          const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
          return acc + (pendente || 0);
        }, 0);
        setValorPagamento(totalSelecionado > 0 ? totalSelecionado.toFixed(2).replace(".", ",") : "");
      }
      return next;
    });
  }

  function salvarPagamento(e: React.FormEvent) {
    e.preventDefault();
    if (!credorPagamentoId || comprasSelecionadasBaixaIds.length === 0 || !valorPagamento) return;

    const valorNum = parseFloat(valorPagamento.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) return;

    const credor = credoresAgrupados.find((c) => c.id === credorPagamentoId);
    if (credor) {
      const totalPendente = comprasSelecionadasBaixaIds.reduce((acc, id) => {
        const compra = (credor.compras || []).find((c) => c.id === id);
        if (!compra) return acc;
        const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
        return acc + (pendente || 0);
      }, 0);
      if (valorNum > totalPendente + 0.01) {
        alert(`O valor do pagamento (R$ ${valorNum.toFixed(2).replace(".", ",")}) não pode ser maior que o saldo pendente total das compras selecionadas (R$ ${totalPendente.toFixed(2).replace(".", ",")})!`);
        return;
      }
    }

    try {
      if (comprasSelecionadasBaixaIds.length === 1) {
        registrarBaixaCompra(credorPagamentoId, comprasSelecionadasBaixaIds[0], valorNum, metodoPagamento, dataPagamento);
      } else {
        let restante = valorNum;
        const comprasOrdenadas = comprasSelecionadasBaixaIds.map((id) => {
          const compra = (credor?.compras || []).find((c) => c.id === id);
          const pendente = compra ? (compra.valorPendente !== undefined ? compra.valorPendente : compra.valor) : 0;
          return { id, pendente };
        }).sort((a, b) => a.pendente - b.pendente);

        for (const { id, pendente } of comprasOrdenadas) {
          if (restante <= 0) break;
          const valorAplicar = Math.min(restante, pendente);
          registrarBaixaCompra(credorPagamentoId, id, valorAplicar, metodoPagamento, dataPagamento);
          restante -= valorAplicar;
        }
      }
      setModalPagamentoOpen(false);
    } catch (err: any) {
      alert(err.message || "Erro ao registrar pagamento.");
    }
  }

  function enviarWhatsApp(c: { nome: string; whatsapp: string; compras: CompraCredor[] }, e: React.MouseEvent) {
    e.stopPropagation();
    const comprasPendentes = (c.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01);
    const totalDevido = comprasPendentes.reduce((acc, comp) => {
      const pendente = comp.valorPendente !== undefined && comp.valorPendente !== null
        ? Number(comp.valorPendente)
        : Number(comp.valor);
      return acc + (isNaN(pendente) ? 0 : pendente);
    }, 0);
    const primeiraPendente = comprasPendentes[0];
    const dataPrometidaStr = primeiraPendente?.dataPrometida || primeiraPendente?.data || getLocalDateStr();
    const dataFormatada = new Date(dataPrometidaStr + "T00:00:00").toLocaleDateString("pt-BR");

    const hojeStr = getLocalDateStr();
    const isVencido = hojeStr > dataPrometidaStr;

    const foneLimpo = c.whatsapp.replace(/\D/g, "");
    const chavePix = "sua-chave-pix@ilmadoces.com.br";

    let mensagem = "";
    if (isVencido) {
      mensagem = `Olá ${c.nome}, tudo bem? Notei que o pagamento do seu fiado de R$ ${totalDevido.toFixed(
        2
      ).replace(".", ",")} (vencido em ${dataFormatada}) ainda consta em aberto. Segue a chave PIX para acerto: ${chavePix}. Qualquer dúvida, estou à disposição!`;
    } else {
      const refPrincipal = primeiraPendente?.descricao || "compras em aberto";
      mensagem = `Olá ${c.nome}, tudo bem? Passando para lembrar do seu fiado no valor de R$ ${totalDevido.toFixed(
        2
      ).replace(".", ",")} referente ao pedido ${refPrincipal} (vencimento em ${dataFormatada}). Segue a chave PIX para facilitar: ${chavePix}. Qualquer dúvida estou à disposição!`;
    }

    const url = `https://api.whatsapp.com/send?phone=55${foneLimpo}&text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  }

  function getStatusVencimento(c: { compras: CompraCredor[] }) {
    const comprasPendentes = (c.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01);
    if (comprasPendentes.length === 0) return { tipo: "quitado" };

    const hojeMs = new Date(getLocalDateStr() + "T12:00:00").getTime();
    
    // Encontrar a compra mais criticamente vencida (maior atraso)
    let maxAtrasoDias = -999999;
    let maisAntigaVencida = comprasPendentes[0];

    comprasPendentes.forEach((compra) => {
      const dataVenc = compra.dataPrometida || compra.data || getLocalDateStr();
      const vencMs = new Date(dataVenc + "T00:00:00").getTime();
      const diffDias = Math.floor((hojeMs - vencMs) / (1000 * 60 * 60 * 24));
      if (diffDias > maxAtrasoDias) {
        maxAtrasoDias = diffDias;
        maisAntigaVencida = compra;
      }
    });

    const dataPrometida = maisAntigaVencida.dataPrometida || maisAntigaVencida.data || getLocalDateStr();

    if (hojeMs > new Date(dataPrometida + "T00:00:00").getTime()) {
      return { tipo: "vencido", dias: maxAtrasoDias, data: dataPrometida };
    } else {
      return { tipo: "no_prazo", data: dataPrometida };
    }
  }

  function getStatusCompraIndividual(compra: CompraCredor) {
    if (compra.pago) return { label: "Quitado", cor: "bg-emerald-500/15 text-emerald-400" };
    const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
    if (pendente < compra.valor) {
      return { label: `⏳ Parcial: Restam R$ ${pendente.toFixed(2).replace(".", ",")}`, cor: "bg-amber-500/20 text-amber-400 font-bold" };
    }
    const hojeMs = new Date(getLocalDateStr() + "T12:00:00").getTime();
    const dataVenc = compra.dataPrometida || compra.data || getLocalDateStr();
    const vencMs = new Date(dataVenc + "T00:00:00").getTime();
    const diffDias = Math.floor((hojeMs - vencMs) / (1000 * 60 * 60 * 24));

    if (diffDias > 0) {
      return { label: `⚠️ Vencido há ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`, cor: "bg-red-500/20 text-red-400 font-bold" };
    } else {
      const diasFaltam = Math.abs(diffDias);
      return { label: `⏳ Faltam ${diasFaltam} ${diasFaltam === 1 ? 'dia' : 'dias'} para o vencimento`, cor: "bg-neutral-800 text-neutral-400" };
    }
  }

  // Filtragem por Tab e Busca
  const credoresFiltrados = credoresAgrupados.filter((c) => {
    const comprasEmAberto = (c.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01);
    const comprasQuitadas = (c.compras || []).filter((comp) => comp.pago || (comp.valorPendente ?? comp.valor) <= 0.01);
    const temEmAberto = comprasEmAberto.length > 0;
    const temQuitado = comprasQuitadas.length > 0 || (c.pagamentos || []).length > 0;

    const matchTab = abaAtiva === "em_aberto" ? temEmAberto : temQuitado;
    const q = busca.toLowerCase();
    const matchBusca = !q || c.nome.toLowerCase().includes(q) || c.whatsapp.includes(q);
    return matchTab && matchBusca;
  });

  // Ordenação
  const credoresOrdenados = [...credoresFiltrados].sort((a, b) => {
    const totalA = (a.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01).reduce((s, comp) => s + (comp.valorPendente ?? comp.valor), 0);
    const totalB = (b.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01).reduce((s, comp) => s + (comp.valorPendente ?? comp.valor), 0);

    if (ordenacao === "maior_valor") {
      return totalB - totalA;
    }

    if (ordenacao === "antigos") {
      const dataA = Math.min(...(a.compras || []).map((p) => new Date((p.data || "2026-01-01") + "T00:00:00").getTime()), new Date().getTime());
      const dataB = Math.min(...(b.compras || []).map((p) => new Date((p.data || "2026-01-01") + "T00:00:00").getTime()), new Date().getTime());
      return dataA - dataB;
    }

    if (ordenacao === "vencimento") {
      const pendA = (a.compras || []).find((p) => !p.pago && (p.valorPendente ?? p.valor) > 0.01)?.dataPrometida || "2099-12-31";
      const pendB = (b.compras || []).find((p) => !p.pago && (p.valorPendente ?? p.valor) > 0.01)?.dataPrometida || "2099-12-31";
      return new Date(pendA).getTime() - new Date(pendB).getTime();
    }

    return 0;
  });

  const totalGeralDevido = credoresAgrupados.reduce((acc, c) => {
    const devendo = (c.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01).reduce((sum, comp) => sum + (comp.valorPendente ?? comp.valor), 0);
    return acc + devendo;
  }, 0);

  const qtdEmAberto = credoresAgrupados.filter((c) => (c.compras || []).some((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0.01)).length;
  const qtdQuitados = credoresAgrupados.filter((c) => (c.compras || []).some((comp) => comp.pago || (comp.valorPendente ?? comp.valor) <= 0.01) || (c.pagamentos || []).length > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Credores e Fiados</h1>
          <p className="mt-1 text-sm text-neutral-400">Gerenciamento unificado por cliente, contadores individuais e reatividade de datas</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalHistoricoOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-neutral-300 transition-all hover:bg-neutral-700 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Historico Geral de Entradas
          </button>
          <button
            onClick={abrirNovoCredor}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Credor / Fiado
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Receita Prevista (Fiados em Aberto)</p>
            <h3 className="mt-1 text-2xl font-bold text-amber-400">R$ {totalGeralDevido.toFixed(2).replace(".", ",")}</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Status dos Clientes</p>
            <h3 className="mt-1 text-base font-bold text-white">
              <span className="text-amber-400">{qtdEmAberto}</span> em aberto • <span className="text-emerald-400">{qtdQuitados}</span> quitados
            </h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wine-500/10 text-wine-400">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tabs & Search & Ordering */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-2 rounded-xl bg-neutral-900 p-1.5 border border-neutral-800 w-full md:w-auto">
          <button
            onClick={() => setAbaAtiva("em_aberto")}
            className={`flex-1 md:flex-none rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              abaAtiva === "em_aberto"
                ? "bg-wine-500 text-white shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Em Aberto ({qtdEmAberto})
          </button>
          <button
            onClick={() => setAbaAtiva("quitados")}
            className={`flex-1 md:flex-none rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              abaAtiva === "quitados"
                ? "bg-wine-500 text-white shadow"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Histórico / Quitados ({qtdQuitados})
          </button>
        </div>

        {/* Search & Ordenação */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <svg className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-wine-500 focus:outline-none"
            />
          </div>

          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as OrdenacaoCredor)}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
          >
            <option value="antigos">Mais Antigos Primeiro (Maior Tempo)</option>
            <option value="maior_valor">Maior Valor Primeiro</option>
            <option value="vencimento">Data de Vencimento / Prometida</option>
            <option value="recentes">Mais Recentes Primeiro</option>
          </select>
        </div>
      </div>

      {/* Accordion List */}
      {credoresOrdenados.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-white">Nenhum registro encontrado nesta aba</h3>
          <p className="mt-1 text-xs text-neutral-400">Tente mudar o filtro de busca ou a aba de visualização.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {credoresOrdenados.map((credor) => {
            const comprasPendentes = (credor.compras || []).filter((c) => !c.pago && (c.valorPendente ?? c.valor) > 0.01);
            const comprasQuitadas = (credor.compras || []).filter((c) => c.pago || (c.valorPendente ?? c.valor) <= 0.01);
            const totalDevendo = comprasPendentes.reduce((acc, c) => acc + (c.valorPendente ?? c.valor), 0);
            const isExpanded = !!expandedCredores[credor.id];
            const ultimaOrigem = credor.compras?.[credor.compras.length - 1]?.origem || "manual";
            const statusVencimento = getStatusVencimento(credor);

            return (
              <div
                key={credor.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden transition-all hover:border-neutral-700"
              >
                {/* Main Row */}
                <div
                  onClick={() => toggleExpand(credor.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-white">{credor.nome}</h3>
                        <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-400 uppercase">
                          {ultimaOrigem}
                        </span>
                        {totalDevendo > 0 ? (
                          statusVencimento.tipo === "vencido" ? (
                            <span className="rounded-full bg-red-500/20 border border-red-500/40 px-2.5 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
                              ⚠️ Vencido há {statusVencimento.dias} {statusVencimento.dias === 1 ? "dia" : "dias"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-neutral-800 border border-neutral-700 px-2.5 py-0.5 text-[10px] font-medium text-neutral-400">
                              Vence em {new Date(statusVencimento.data + "T00:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          )
                        ) : (
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            Quitado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        📱 {formatarTelefone(credor.whatsapp)} {credor.observacoes ? `• 📝 ${credor.observacoes}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-semibold text-neutral-500">Total Devendo</p>
                      <p className={`text-lg font-bold ${totalDevendo > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        R$ {totalDevendo.toFixed(2).replace(".", ",")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {abaAtiva === "em_aberto" && totalDevendo > 0 && (
                        <button
                          onClick={(e) => enviarWhatsApp(credor, e)}
                          className="rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5"
                          title="Cobrar via WhatsApp"
                        >
                          <span>💬 WhatsApp</span>
                        </button>
                      )}
                      {abaAtiva === "em_aberto" && totalDevendo > 0 && (
                        <button
                          onClick={(e) => abrirPagamento(credor.id, e)}
                          className="rounded-xl bg-wine-500 px-3 py-2 text-xs font-semibold text-white hover:bg-wine-600 transition-colors"
                          title="Registrar Baixa / Pagamento"
                        >
                          💵 Dar Baixa
                        </button>
                      )}
                      <button
                        onClick={() => toggleExpand(credor.id)}
                        className="rounded-xl border border-neutral-700 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                        title={isExpanded ? "Recolher" : "Expandir histórico"}
                      >
                        <svg className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Accordion Content */}
                {isExpanded && (
                  <div className="border-t border-neutral-800 bg-neutral-950/60 p-6 space-y-6">
                    {/* Compras em Aberto (na aba Em Aberto) ou Compras Quitadas (na aba Quitados) */}
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className={`text-xs font-semibold uppercase tracking-wider ${abaAtiva === "em_aberto" ? "text-amber-400" : "text-emerald-400"}`}>
                            {abaAtiva === "em_aberto" ? "Compras em Aberto" : "Histórico de Compras Quitadas"} ({abaAtiva === "em_aberto" ? comprasPendentes.length : comprasQuitadas.length})
                          </h4>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => abrirEditarCredor(credor)}
                              className="text-xs text-neutral-400 hover:text-white underline"
                            >
                              Editar Dados
                            </button>
                            <span className="text-neutral-700">|</span>
                            <button
                              onClick={() => {
                                if (confirm(`Deseja excluir o credor ${credor.nome}?`)) removerCredor(credor.id);
                              }}
                              className="text-xs text-red-400 hover:text-red-300 underline"
                            >
                              Excluir Credor
                            </button>
                          </div>
                        </div>

                        {((abaAtiva === "em_aberto" ? comprasPendentes : comprasQuitadas).length === 0) ? (
                          <p className="text-xs text-neutral-500 py-2">Nenhum registro encontrado nesta aba.</p>
                        ) : (
                          <div className="space-y-3">
                            {(abaAtiva === "em_aberto" ? comprasPendentes : comprasQuitadas).map((compra) => {
                              const statusInd = getStatusCompraIndividual(compra);
                              return (
                                <div key={compra.id} className={`rounded-xl border ${compra.pago ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-900'} p-4 space-y-3`}>
                                  {/* Cabeçalho da Compra */}
                                   <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b ${compra.pago ? 'border-emerald-500/20' : 'border-neutral-800'} pb-2.5`}>
                                     <div className="space-y-1">
                                       <p className="text-xs text-neutral-400">
                                         Entrada: <span className="text-white font-medium">{new Date((compra.data || getLocalDateStr()) + 'T12:00:00').toLocaleDateString('pt-BR')}</span> | Vencimento: <span className={`${compra.pago ? 'text-neutral-300' : 'text-amber-400'} font-medium`}>{new Date((compra.dataPrometida || compra.data || getLocalDateStr()) + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                       </p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusInd.cor}`}>
                                            {statusInd.label}
                                          </span>
                                          {getOrderBadge(compra.referenciaId)}
                                        </div>
                                     </div>
                                     <div className="flex items-center gap-3">
                                       <div className="text-right">
                                         {/* Cálculo claro: Total, Pago, Saldo */}
                                         {(() => {
                                           const totalBaixas = (compra.baixas || []).reduce((acc, b) => acc + (Number(b.valorPago) || 0), 0);
                                           const saldoRestante = Math.max(0, compra.valor - totalBaixas);
                                           const temBaixas = totalBaixas > 0;
                                           return (
                                             <div className="space-y-0.5">
                                               <p className="text-[10px] text-neutral-500">Total do Pedido</p>
                                               <p className={`text-sm font-bold ${compra.pago ? 'text-emerald-400' : 'text-white'}`}>R$ {compra.valor.toFixed(2).replace(".", ",")}</p>
                                               {temBaixas && (
                                                 <>
                                                   <p className="text-[10px] text-neutral-500">Total Ja Pago</p>
                                                   <p className="text-xs font-bold text-emerald-400">- R$ {totalBaixas.toFixed(2).replace(".", ",")}</p>
                                                   <div className="border-t border-neutral-700 pt-0.5 mt-0.5">
                                                     <p className="text-[10px] text-neutral-500">Saldo Restante</p>
                                                     <p className={`text-sm font-bold ${saldoRestante > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                       R$ {saldoRestante.toFixed(2).replace(".", ",")}
                                                     </p>
                                                   </div>
                                                 </>
                                               )}
                                             </div>
                                           );
                                         })()}
                                       </div>
                                       <button
                                         onClick={() => abrirEditarCompra(credor.id, compra)}
                                         className="text-neutral-400 hover:text-white text-xs p-1"
                                         title="Editar compra e datas"
                                       >
                                         ✏️
                                       </button>
                                       <button
                                         onClick={() => removerCompra(credor.id, compra.id)}
                                         className="text-neutral-600 hover:text-red-400 text-xs p-1"
                                         title="Remover compra"
                                       >
                                         🗑️
                                       </button>
                                      </div>
                                    </div>

                                   {/* Histórico de Baixas Parciais da Compra */}
                                   {compra.baixas && compra.baixas.length > 0 && (
                                     <div className="pt-2 space-y-1.5">
                                       <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Baixas Registradas:</p>
                                        {compra.baixas.map((b, i) => (
                                          <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-neutral-950/40 px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-emerald-400 font-medium">R$ {(Number(b.valorPago) || 0).toFixed(2).replace(".", ",")}</span>
                                              <span className="text-[10px] text-neutral-500">via {paymentLabelOf(b.formaPagamento)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-[10px] text-neutral-500">{new Date(b.dataBaixa + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                              <button
                                                onClick={() => {
                                                  if (confirm("Deseja estornar esta baixa e reabrir o valor correspondente?")) {
                                                    removerPagamento(credor.id, b.pagamentoCredorId || b.id);
                                                  }
                                                }}
                                                className="text-red-400/60 hover:text-red-400 text-[10px] transition-colors"
                                                title="Estornar baixa"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                     </div>
                                   )}

                                   {/* Lista Vertical de Itens */}
                                   {compra.itens && compra.itens.length > 0 ? (
                                     <ul className="space-y-1.5 pl-1">
                                       {compra.itens.map((item, idx) => {
                                         const cleanDesc = item.descricao.replace(/^[0-9]+x\s*/i, "").replace(/\s*x[0-9]+$/i, "").trim();
                                         const totalQtdItens = compra.itens!.reduce((acc, i) => acc + i.quantidade, 0) || 1;
                                         const valorUnit = item.valorUnitario !== undefined && !isNaN(item.valorUnitario) && item.valorUnitario > 0
                                           ? item.valorUnitario
                                           : (compra.valor / totalQtdItens);
                                         const subtotalItem = item.quantidade * valorUnit;
                                         return (
                                           <li key={idx} className="flex items-center justify-between text-xs text-neutral-300">
                                             <span>• {item.quantidade}x {cleanDesc}</span>
                                             <span className="text-neutral-400 font-medium">R$ {subtotalItem.toFixed(2).replace(".", ",")}</span>
                                           </li>
                                         );
                                       })}
                                     </ul>
                                   ) : (
                                     <ul className="space-y-1.5 pl-1">
                                       {compra.descricao.split(",").map((part, idx) => {
                                         const trimmed = part.trim();
                                         const cleanPart = trimmed.replace(/^[0-9]+x\s*/i, "").replace(/\s*x[0-9]+$/i, "").trim();
                                         const matchQtd = trimmed.match(/^([0-9]+)x/i);
                                         const qtd = matchQtd ? parseInt(matchQtd[1]) : 1;
                                         const fallbackVal = compra.valor / (compra.descricao.split(",").length || 1);
                                         return (
                                           <li key={idx} className="flex items-center justify-between text-xs text-neutral-300">
                                             <span>• {qtd}x {cleanPart}</span>
                                             <span className="text-neutral-400 font-medium">R$ {fallbackVal.toFixed(2).replace(".", ",")}</span>
                                           </li>
                                         );
                                       })}
                                     </ul>
                                   )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar Credor com Formulário Compacto (Estilo Tabela de Adição) */}
      {modalCredorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl my-8">
            <h3 className="text-lg font-bold text-white">
              {credorEditando ? "Editar Credor" : "Novo Credor / Fiado"}
            </h3>
            <form onSubmit={salvarCredor} className="space-y-4">
              {customers.length === 0 ? (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-center space-y-3">
                  <p className="text-xs text-amber-300">Cliente não encontrado. Cadastre o cliente em &apos;Clientes&apos; antes de lançar um fiado.</p>
                  <Link
                    href="/admin/clientes"
                    className="inline-block rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-amber-400 transition-colors"
                  >
                    Cadastrar Cliente
                  </Link>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Selecionar Cliente Cadastrado *</label>
                    <select
                      required
                      value={clienteId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setClienteId(id);
                        const cust = customers.find((c) => c.id === id);
                        if (cust) {
                          setNome(cust.name);
                          setWhatsapp(cust.phone);
                        }
                      }}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                    >
                      <option value="">Selecione um cliente...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({formatarTelefone(c.phone)})</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs text-neutral-400 bg-neutral-950/50 p-2.5 rounded-xl border border-neutral-800 flex justify-between items-center">
                    <span>Nome: <strong className="text-white">{nome || "Nenhum selecionado"}</strong></span>
                    <span>WhatsApp: <strong className="text-white">{whatsapp || "-"}</strong></span>
                  </div>
                </>
              )}

              {!credorEditando && customers.length > 0 && (
                <div className="border-t border-neutral-800 pt-3 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Adicionar Itens à Dívida</h4>

                  {/* Linha de Inclusão Rápida */}
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={tipoAtual}
                        onChange={(e) => setTipoAtual(e.target.value as "catalogo" | "custom")}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="catalogo">Produto do Cardápio</option>
                        <option value="custom">Item Customizado / Avulso</option>
                      </select>
                      {tipoAtual === "catalogo" ? (
                        <select
                          value={prodAtualId}
                          onChange={(e) => setProdAtualId(e.target.value)}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none"
                        >
                          <option value="">Selecione o produto...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} (R$ {p.price.toFixed(2).replace(".", ",")})</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Ex: Encomenda especial da Maria"
                          value={descAtual}
                          onChange={(e) => setDescAtual(e.target.value)}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none"
                        />
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qtd"
                          value={qtdAtual}
                          onChange={(e) => setQtdAtual(parseInt(e.target.value) || 1)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white text-center focus:outline-none"
                        />
                      </div>
                      {tipoAtual === "custom" && (
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Valor Unitário R$"
                            value={valorAtual}
                            onChange={(e) => setValorAtual(e.target.value)}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={adicionarItemAoCarrinho}
                        className="flex-1 rounded-lg bg-wine-500 px-4 py-2 text-xs font-semibold text-white hover:bg-wine-600 transition-colors"
                      >
                        + Adicionar Item
                      </button>
                    </div>
                  </div>

                  {/* Lista Compacta de Itens Adicionados */}
                  {itensCarrinho.length > 0 && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2">
                      <p className="text-[10px] uppercase font-semibold text-neutral-500">Itens na Lista ({itensCarrinho.length})</p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {itensCarrinho.map((item) => {
                          const unit = item.tipo === "catalogo" ? (products.find((p) => p.id === item.produtoId)?.price || 0) : item.valorUnitario;
                          const subtotal = unit * item.quantidade;
                          return (
                            <div key={item.id} className="flex items-center justify-between text-xs bg-neutral-900 p-2 rounded-lg border border-neutral-800">
                              <span className="text-white font-medium">
                                {item.quantidade}x {item.descricao}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-400 font-semibold">R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                                <button
                                  type="button"
                                  onClick={() => removerItemDoCarrinho(item.id)}
                                  className="text-neutral-500 hover:text-red-400"
                                  title="Remover"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Totalizador Compacto */}
                  <div className="flex items-center justify-between rounded-xl bg-wine-500/10 border border-wine-500/30 px-4 py-3">
                    <span className="text-xs font-bold text-wine-300 uppercase tracking-wider">Valor Total da Dívida</span>
                    <span className="text-lg font-bold text-wine-400">R$ {valorTotalCarrinho.toFixed(2).replace(".", ",")}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Entrada *</label>
                      <input
                        type="date"
                        required
                        value={dataCompra}
                        onChange={(e) => setDataCompra(e.target.value)}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-wine-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">Data Prometida *</label>
                      <input
                        type="date"
                        required
                        value={dataPrometida}
                        onChange={(e) => setDataPrometida(e.target.value)}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white focus:border-wine-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Observações (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Vizinha da quadra 3, paga toda segunda-feira"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-600 focus:border-wine-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCredorOpen(false)}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                {customers.length > 0 && (
                  <button
                    type="submit"
                    className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                  >
                    Salvar Dívida
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Compra */}
      {modalCompraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Adicionar Compra / Fiado</h3>
            <form onSubmit={salvarCompra} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Tipo de Item *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCompraTipo("catalogo")}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      compraTipo === "catalogo"
                        ? "border-wine-500 bg-wine-500/15 text-wine-400"
                        : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
                    }`}
                  >
                    Produto do Cardápio
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompraTipo("custom")}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      compraTipo === "custom"
                        ? "border-wine-500 bg-wine-500/15 text-wine-400"
                        : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
                    }`}
                  >
                    Item Avulso / Custom
                  </button>
                </div>
              </div>

              {compraTipo === "catalogo" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Produto *</label>
                    <select
                      required
                      value={compraProdutoId}
                      onChange={(e) => setCompraProdutoId(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                    >
                      <option value="">Selecione o produto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — R$ {p.price.toFixed(2).replace(".", ",")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Quantidade *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={compraQtd}
                      onChange={(e) => setCompraQtd(parseInt(e.target.value) || 1)}
                      className="w-28 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white text-center focus:border-wine-500 focus:outline-none"
                    />
                  </div>
                  {compraProdutoId && (() => {
                    const prod = products.find((p) => p.id === compraProdutoId);
                    if (!prod) return null;
                    return (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
                        <div className="flex justify-between">
                          <span>Unitário</span>
                          <span className="text-white font-semibold">R$ {prod.price.toFixed(2).replace(".", ",")}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span>Total ({compraQtd}x)</span>
                          <span className="text-wine-400 font-bold">R$ {(prod.price * compraQtd).toFixed(2).replace(".", ",")}</span>
                        </div>
                        {prod.controlarEstoque && (
                          <div className="flex justify-between mt-1">
                            <span>Estoque atual</span>
                            <span className={(prod.estoque ?? 0) <= (prod.estoqueCritico ?? 2) ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                              {prod.estoque ?? 0} un
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Descrição do Produto/Serviço *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 2 Bolos de Cenoura + 1 Brigadeiro"
                      value={descCompra}
                      onChange={(e) => setDescCompra(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-wine-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Valor (R$) *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 45,00"
                      value={valorCompra}
                      onChange={(e) => setValorCompra(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-wine-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Entrada / Registro *</label>
                  <input
                    type="date"
                    required
                    value={compraData}
                    onChange={(e) => setCompraData(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data Prometida *</label>
                  <input
                    type="date"
                    required
                    value={compraDataPrometida}
                    onChange={(e) => setCompraDataPrometida(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCompraOpen(false)}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Compra (Datas e Valores) */}
      {modalEditarCompraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Editar Compra / Fiado & Datas</h3>
            <form onSubmit={salvarEdicaoCompra} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Descrição do Produto/Serviço *</label>
                <input
                  type="text"
                  required
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Valor (R$) *</label>
                <input
                  type="text"
                  required
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none font-bold text-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Entrada *</label>
                  <input
                    type="date"
                    required
                    value={editData}
                    onChange={(e) => setEditData(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data Prometida *</label>
                  <input
                    type="date"
                    required
                    value={editDataPrometida}
                    onChange={(e) => setEditDataPrometida(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEditarCompraOpen(false)}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Pagamento / Baixa */}
      {modalPagamentoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl my-8">
            <h3 className="text-lg font-bold text-white">Registrar Baixa / Pagamento (Inteligente & Parcial)</h3>
            <form onSubmit={salvarPagamento} className="space-y-4">
              {/* Seleção de Compras (Múltipla) */}
              {(() => {
                const credor = credoresAgrupados.find((c) => c.id === credorPagamentoId);
                const openCompras = credor ? (credor.compras || []).filter((comp) => !comp.pago && (comp.valorPendente ?? comp.valor) > 0) : [];
                if (openCompras.length === 0) return <p className="text-xs text-neutral-400">Nenhuma compra em aberto para este cliente.</p>;
                const totalSelecionado = comprasSelecionadasBaixaIds.reduce((acc, id) => {
                  const compra = openCompras.find((c) => c.id === id);
                  if (!compra) return acc;
                  const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
                  return acc + (pendente || 0);
                }, 0);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-neutral-400">Selecionar Compra(s) para Baixa *</label>
                      <span className="text-[11px] text-neutral-500">
                        {comprasSelecionadasBaixaIds.length > 0 ? (
                          <span className="text-wine-400 font-semibold">Total: R$ {totalSelecionado.toFixed(2).replace(".", ",")}</span>
                        ) : (
                          "Nenhuma selecionada"
                        )}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      {openCompras.map((compra) => {
                        const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
                        const isSelected = comprasSelecionadasBaixaIds.includes(compra.id);
                        return (
                          <label key={compra.id} className={`flex items-center justify-between text-xs p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? "border-wine-500/50 bg-wine-500/10" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                          }`}>
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectCompraBaixa(compra.id)}
                                className="rounded border-neutral-600 bg-neutral-800 text-wine-500 focus:ring-0"
                              />
                              <div>
                                <p className="text-white font-medium">{compra.descricao}</p>
                                <p className="text-[10px] text-neutral-400">Data: {new Date((compra.data || getLocalDateStr()) + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                              </div>
                            </div>
                            <span className="font-bold text-amber-400">R$ {pendente.toFixed(2).replace(".", ",")}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Valor do Pagamento (R$) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 50,00"
                  value={valorPagamento}
                  onChange={(e) => setValorPagamento(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-wine-500 focus:outline-none font-bold text-emerald-400 text-lg"
                />
                <p className="text-[11px] text-neutral-500 mt-1">Baixa parcial ou total. Ao selecionar múltiplas compras, o valor é distribuído automaticamente.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Forma de Recebimento *</label>
                  <select
                    value={metodoPagamento}
                    onChange={(e) => setMetodoPagamento(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão Débito">Cartão Débito</option>
                    <option value="Cartão Crédito">Cartão Crédito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data da Baixa *</label>
                  <input
                    type="date"
                    required
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Observação / Comprovante (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Pago via comprovante PIX enviado no WhatsApp"
                  value={obsPagamento}
                  onChange={(e) => setObsPagamento(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-wine-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalPagamentoOpen(false)}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                >
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Histórico Geral de Entradas */}
      {modalHistoricoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Histórico Geral de Entradas</h3>
              <button
                onClick={() => setModalHistoricoOpen(false)}
                className="text-neutral-500 hover:text-white text-xl leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Resumo Geral */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Recebido</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">
                  R$ {credoresAgrupados.reduce((acc, c) => {
                    const total = (c.pagamentos || []).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
                    return acc + total;
                  }, 0).toFixed(2).replace(".", ",")}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total em Aberto</p>
                <p className="mt-1 text-lg font-bold text-amber-400">
                  R$ {totalGeralDevido.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total de Entradas</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {credoresAgrupados.reduce((acc, c) => acc + (c.pagamentos || []).length, 0)}
                </p>
              </div>
            </div>

            {/* Lista de Todas as Entradas */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {credoresAgrupados
                .flatMap((c) =>
                  (c.pagamentos || []).map((p) => ({
                    ...p,
                    credorNome: c.nome,
                    credorWhatsapp: c.whatsapp,
                  }))
                )
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                .length === 0 ? (
                <p className="text-xs text-neutral-500 py-6 text-center">Nenhuma entrada registrada ainda.</p>
              ) : (
                credoresAgrupados
                  .flatMap((c) =>
                    (c.pagamentos || []).map((p) => ({
                      ...p,
                      credorNome: c.nome,
                      credorWhatsapp: c.whatsapp,
                    }))
                  )
                  .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                  .map((entrada) => (
                    <div key={entrada.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-400">R$ {entrada.valor.toFixed(2).replace(".", ",")}</span>
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{entrada.metodo}</span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {entrada.credorNome} • {new Date((entrada.data || getLocalDateStr()) + 'T12:00:00').toLocaleDateString('pt-BR')}
                          {entrada.observacao ? ` • ${entrada.observacao}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Deseja estornar esta baixa de R$ ${entrada.valor.toFixed(2).replace(".", ",")} de ${entrada.credorNome}?`)) {
                            removerPagamento(
                              credoresAgrupados.find((c) => c.nome === entrada.credorNome)?.id || "",
                              entrada.id
                            );
                          }
                        }}
                        className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Reabrir Dívida / Estornar"
                      >
                        🔄 Estornar
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setModalHistoricoOpen(false)}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
