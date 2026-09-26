import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinanceiroStore, montarTransacao } from './financeiroStore';
import { getLocalDateStr, paymentLabelOf } from './utils';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, runTransaction } from 'firebase/firestore';
import { notifyError } from './notifications';
import { divergenciaDeReversaoCredor, type OpcoesReversao } from './antiRollback';
import type { Credor, CompraCredor, CompraItem, BaixaCompra, PagamentoCredor, FinancialTransaction } from '@/types/database';

type CredorRemoto = Omit<Credor, "id">;

if (typeof window !== "undefined") {
  onSnapshot(collection(db, "credores"), (snapshot) => {
    const credores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Credor));
    useCredoresStore.setState({ credores });
  });
}

function agoraLocalISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function recalcularCompra(compra: CompraCredor): CompraCredor {
  if (compra.status === 'CANCELADO') {
    return { ...compra, valorPendente: 0, pago: false, status: 'CANCELADO' };
  }
  const totalBaixas = (compra.baixas || []).reduce((acc, b) => (Number(b.valorPago) || 0) + acc, 0);
  const valorPendenteCalc = Math.max(0, Number((compra.valor - totalBaixas).toFixed(2)));
  const pago = compra.pago || valorPendenteCalc <= 0.01;
  const valorPendente = pago ? 0 : valorPendenteCalc;
  return {
    ...compra,
    valorPendente,
    pago,
    status: pago ? 'QUITADO' : 'PENDENTE',
  };
}

function erroAmigavel(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function encontrarCredor(credores: Credor[], credorId: string, compraId?: string): Credor | undefined {
  return credores.find(
    (c) =>
      c.id === credorId ||
      (!!compraId && (c.compras || []).some((comp) => comp.id === compraId)) ||
      (c.compras || []).some((comp) => comp.id === credorId)
  );
}

function numeroPedidoPorId(pedidoId: string): string {
  if (pedidoId) {
    try {
      const cached = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("ilma-orders") || "{}")?.state?.orders : [];
      const ord = (cached || []).find((o: any) => o.id === pedidoId);
      if (ord && ord.orderNumber) {
        return `#${ord.orderNumber}`;
      }
    } catch (e) {}
  }
  return pedidoId ? `#${pedidoId.slice(-6)}` : "";
}

function observacaoDaBaixa(compra: CompraCredor): string {
  const refOrderNum = compra.referenciaId ? numeroPedidoPorId(compra.referenciaId) : "";
  return refOrderNum ? `Baixa na compra ${refOrderNum}` : `Baixa na compra #${compra.id.slice(0, 6)}`;
}

async function aplicarEdicaoCredor(
  alvo: Credor,
  transformar: (base: Credor) => Credor,
  opcoes?: OpcoesReversao
): Promise<Credor> {
  const ref = doc(db, "credores", alvo.id);
  const snap = await getDoc(ref);
  const remoto = snap.exists() ? ({ id: snap.id, ...(snap.data() as CredorRemoto) } as Credor) : null;
  const base = remoto ?? alvo;
  const atualizado = transformar(base);
  if (remoto && !opcoes?.permitirReverter && divergenciaDeReversaoCredor(remoto, atualizado)) {
    throw new Error("Este registro já está liquidado e não pode ser revertido por esta ação. Use a opção de reabrir/estornar.");
  }
  await setDoc(ref, atualizado);
  return atualizado;
}

interface CredoresState {
  credores: Credor[];
  adicionarCredor: (credor: Omit<Credor, 'id' | 'compras' | 'pagamentos'>) => Promise<string>;
  editarCredor: (id: string, dados: Partial<Omit<Credor, 'id' | 'compras' | 'pagamentos'>>) => Promise<void>;
  removerCredor: (id: string) => Promise<void>;
  adicionarCompra: (credorId: string, compra: Omit<CompraCredor, 'id' | 'pago'>) => Promise<void>;
  editarCompra: (credorId: string, compraId: string, dados: Partial<CompraCredor>, opcoes?: OpcoesReversao) => Promise<void>;
  removerCompra: (credorId: string, compraId: string, opcoes?: OpcoesReversao) => Promise<void>;
  registrarLembrete: (credorId: string, compraId: string) => Promise<void>;
  registrarBaixaCompra: (credorId: string, compraId: string, valorPago: number, formaPagamento: string, dataBaixa: string) => Promise<void>;
  registrarBaixaMultipla: (credorId: string, itens: { compraId: string; valorPago: number }[], formaPagamento: string, dataBaixa: string) => Promise<void>;
  removerPagamento: (credorId: string, pagamentoId: string) => Promise<void>;
  converterPedidoParaFiado: (dados: {
    clienteId: string;
    nomeCliente: string;
    whatsappCliente: string;
    pedidoId: string;
    origem: 'pedido' | 'agendamento' | 'manual';
    descricaoItens: string;
    valorTotal: number;
    dataPedido?: string;
    dataPrometida?: string;
    frequenciaLembrete?: CompraCredor["frequenciaLembrete"];
    itens?: CompraItem[];
    sinal?: {
      valor: number;
      formaPagamento: string;
    };
  }) => Promise<void>;
  alternarStatusPagamento: (credorId: string, compraId: string, acaoReabrir?: boolean) => Promise<void>;
}

export const useCredoresStore = create<CredoresState>()(
  persist(
    (set, get) => {
      const aplicarLocal = (credor: Credor) =>
        set((state) => ({
          credores: state.credores.some((c) => c.id === credor.id)
            ? state.credores.map((c) => (c.id === credor.id ? credor : c))
            : [...state.credores, credor],
        }));

      return {
        credores: [],

        adicionarCredor: async (dados) => {
          const state = get();
          const foneNovo = dados.whatsapp ? dados.whatsapp.replace(/\D/g, '') : '';
          const existente = state.credores.find((c) => {
            const foneExistente = c.whatsapp ? c.whatsapp.replace(/\D/g, '') : '';
            return (foneNovo && foneExistente && foneNovo === foneExistente) || (c.clienteId && dados.clienteId && c.clienteId === dados.clienteId);
          });
          if (existente) {
            try {
              const atualizado = await aplicarEdicaoCredor(existente, (base) => ({
                ...base,
                nome: dados.nome && dados.nome.trim() ? dados.nome.trim() : base.nome,
                whatsapp: dados.whatsapp && dados.whatsapp.trim() ? dados.whatsapp.trim() : base.whatsapp,
              }));
              aplicarLocal(atualizado);
              return atualizado.id;
            } catch (err) {
              notifyError("Erro", erroAmigavel(err, "Não foi possível salvar o credor."));
              throw err;
            }
          }

          const id = crypto.randomUUID();
          const novoCredor: Credor = { ...dados, nome: dados.nome.trim(), whatsapp: foneNovo, id, compras: [], pagamentos: [] };
          try {
            await aplicarEdicaoCredor(novoCredor, () => novoCredor);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível salvar o credor."));
            throw err;
          }
          aplicarLocal(novoCredor);
          return id;
        },

        editarCredor: async (id, dados) => {
          try {
            const alvo = encontrarCredor(get().credores, id);
            if (!alvo) return;
            const atualizado = await aplicarEdicaoCredor(alvo, (base) => ({ ...base, ...dados }));
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível salvar as alterações."));
          }
        },

        removerCredor: async (id) => {
          if (!id) return;
          try {
            await deleteDoc(doc(db, "credores", id));
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível remover o credor."));
            return;
          }
          set((state) => ({ credores: state.credores.filter((c) => c.id !== id) }));
        },

        adicionarCompra: async (credorId, compra) => {
          const alvo = encontrarCredor(get().credores, credorId);
          if (!alvo) {
            throw new Error("Credor não encontrado.");
          }
          try {
            const atualizado = await aplicarEdicaoCredor(alvo, (base) => {
              const novaCompra: CompraCredor = {
                ...compra,
                id: crypto.randomUUID(),
                valorPendente: compra.valor,
                status: 'PENDENTE',
                pago: false,
                baixas: [],
                frequenciaLembrete: compra.frequenciaLembrete || 'vencimento',
                ultimoLembreteEm: compra.ultimoLembreteEm ?? null,
                dataPrometida: compra.dataPrometida || (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  return getLocalDateStr(d);
                })(),
              };
              return {
                ...base,
                compras: [...(base.compras || []), recalcularCompra(novaCompra)],
              };
            });
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível adicionar a compra."));
            throw err;
          }
        },

        editarCompra: async (credorId, compraId, dados, opcoes) => {
          try {
            const alvo = encontrarCredor(get().credores, credorId, compraId);
            if (!alvo) return;
            const atualizado = await aplicarEdicaoCredor(
              alvo,
              (base) => ({
                ...base,
                compras: (base.compras || []).map((compra) =>
                  compra.id === compraId ? recalcularCompra({ ...compra, ...dados }) : compra
                ),
              }),
              opcoes
            );
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível salvar a compra."));
          }
        },

        removerCompra: async (credorId, compraId, opcoes) => {
          try {
            const alvo = encontrarCredor(get().credores, credorId, compraId);
            if (!alvo) return;
            const atualizado = await aplicarEdicaoCredor(
              alvo,
              (base) => ({
                ...base,
                compras: (base.compras || []).filter((compra) => compra.id !== compraId),
              }),
              opcoes
            );
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível remover a compra."));
          }
        },

        registrarLembrete: async (credorId, compraId) => {
          try {
            const alvo = encontrarCredor(get().credores, credorId, compraId);
            if (!alvo) return;
            const atualizado = await aplicarEdicaoCredor(alvo, (base) => ({
              ...base,
              compras: (base.compras || []).map((compra) =>
                compra.id === compraId ? { ...compra, ultimoLembreteEm: agoraLocalISO() } : compra
              ),
            }));
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível registrar o lembrete."));
          }
        },

        registrarBaixaMultipla: async (credorId, itens, formaPagamento, dataBaixa) => {
          if (!itens.length) {
            throw new Error("Nenhuma compra selecionada para baixa.");
          }
          const dataBaixaStr = dataBaixa ? dataBaixa.slice(0, 10) : getLocalDateStr();
          const alvo = encontrarCredor(get().credores, credorId, itens[0]?.compraId);
          if (!alvo) {
            throw new Error("Credor não encontrado.");
          }

          const resultado = await runTransaction(db, async (t) => {
            const ref = doc(db, "credores", alvo.id);
            const snap = await t.get(ref);
            const remoto = snap.exists() ? ({ id: alvo.id, ...(snap.data() as CredorRemoto) } as Credor) : alvo;
            const nomeCredor = remoto.nome;
            const categoria = paymentLabelOf(formaPagamento);

            const comprasBase = new Map((remoto.compras || []).map((compra) => [compra.id, compra]));
            const comprasAtualizadas = new Map<string, CompraCredor>();
            const novosPagamentos: PagamentoCredor[] = [];
            const novasTransacoes: FinancialTransaction[] = [];
            const pedidoUpdates = new Map<string, Record<string, unknown>>();

            for (const item of itens) {
              const compra = comprasAtualizadas.get(item.compraId) ?? comprasBase.get(item.compraId);
              if (!compra) throw new Error("Compra não encontrada no credor.");
              if (compra.status === "CANCELADO") throw new Error(`A compra "${compra.descricao}" está cancelada.`);
              if (compra.pago || compra.status === "QUITADO") throw new Error(`A compra "${compra.descricao}" já está quitada.`);
              const pendente = compra.valorPendente !== undefined ? compra.valorPendente : compra.valor;
              if (item.valorPago > pendente + 0.01) {
                throw new Error(`O valor pago (R$ ${item.valorPago.toFixed(2)}) não pode ser maior que o saldo pendente (R$ ${pendente.toFixed(2)})!`);
              }

              const pagamentoId = crypto.randomUUID();
              const baixaId = crypto.randomUUID();
              const finTx = montarTransacao({
                tipo: 'RECEITA',
                categoria,
                valor: item.valorPago,
                formaPagamento: categoria,
                descricao: `Baixa Credor (${categoria}) — ${nomeCredor}`,
                data: dataBaixaStr,
              });
              const obsBaixa = observacaoDaBaixa(compra);

              const novaBaixa: BaixaCompra = {
                id: baixaId,
                valorPago: item.valorPago,
                dataBaixa: dataBaixaStr,
                formaPagamento,
                observacao: obsBaixa,
                transacaoFinanceiraId: finTx.id,
                pagamentoCredorId: pagamentoId,
              };
              const novoPagamento: PagamentoCredor = {
                id: pagamentoId,
                valor: item.valorPago,
                data: dataBaixaStr,
                metodo: formaPagamento,
                observacao: obsBaixa,
                transacaoFinanceiraId: finTx.id,
                baixaId,
              };

              const recalculada = recalcularCompra({
                ...compra,
                baixas: [...(compra.baixas || []), novaBaixa],
              });
              comprasAtualizadas.set(item.compraId, recalculada);
              novosPagamentos.push(novoPagamento);
              novasTransacoes.push(finTx);

              if (recalculada.referenciaId) {
                const pedidoUpdate: Record<string, unknown> = { status: "concluido" };
                if (recalculada.pago) pedidoUpdate.dataPagamento = dataBaixaStr;
                pedidoUpdates.set(recalculada.referenciaId, {
                  ...(pedidoUpdates.get(recalculada.referenciaId) || {}),
                  ...pedidoUpdate,
                });
              }
            }

            const pedidosExistentes = new Map<string, boolean>();
            for (const pedidoId of pedidoUpdates.keys()) {
              const ps = await t.get(doc(db, "pedidos", pedidoId));
              pedidosExistentes.set(pedidoId, ps.exists());
            }

            const credorAtualizado: Credor = {
              ...remoto,
              compras: (remoto.compras || []).map((compra) => comprasAtualizadas.get(compra.id) ?? compra),
              pagamentos: [...novosPagamentos, ...(remoto.pagamentos || [])],
            };

            t.set(ref, credorAtualizado);
            for (const finTx of novasTransacoes) {
              t.set(doc(db, "financeiro", finTx.id), finTx);
            }
            for (const [pedidoId, pedidoUpdate] of pedidoUpdates) {
              if (pedidosExistentes.get(pedidoId)) {
                t.set(doc(db, "pedidos", pedidoId), pedidoUpdate, { merge: true });
              }
            }

            return { credorAtualizado, novasTransacoes };
          });

          aplicarLocal(resultado.credorAtualizado);
          resultado.novasTransacoes.forEach((finTx) => useFinanceiroStore.getState().incluirTransacaoLocal(finTx));
        },

        registrarBaixaCompra: async (credorId, compraId, valorPago, formaPagamento, dataBaixa) => {
          await get().registrarBaixaMultipla(credorId, [{ compraId, valorPago }], formaPagamento, dataBaixa);
        },

        removerPagamento: async (credorId, pagamentoId) => {
          const state = get();
          const alvo = state.credores.find(
            (c) => c.id === credorId || (c.pagamentos || []).some((p) => p.id === pagamentoId)
          );
          if (!alvo) {
            throw new Error("Pagamento não encontrado.");
          }

          const resultado = await runTransaction(db, async (t) => {
            const ref = doc(db, "credores", alvo.id);
            const snap = await t.get(ref);
            const remoto = snap.exists() ? ({ id: alvo.id, ...(snap.data() as CredorRemoto) } as Credor) : alvo;

            const pagamentoAlvo = (remoto.pagamentos || []).find((p) => p.id === pagamentoId);
            if (!pagamentoAlvo) {
              throw new Error("Pagamento não encontrado no servidor.");
            }

            const novosPagamentos = (remoto.pagamentos || []).filter((p) => p.id !== pagamentoId);

            const comprasAtualizadas = (remoto.compras || []).map((compra) => {
              const temBaixaCorrespondente = (compra.baixas || []).some((b) => {
                if (pagamentoAlvo.baixaId && b.id === pagamentoAlvo.baixaId) return true;
                if (pagamentoAlvo.pagamentoCredorId && b.pagamentoCredorId === pagamentoAlvo.pagamentoCredorId) return true;
                if (b.valorPago === pagamentoAlvo.valor) return true;
                return false;
              });

              if (!temBaixaCorrespondente) return compra;

              const novasBaixas = (compra.baixas || []).filter((b) => {
                if (pagamentoAlvo.baixaId && b.id === pagamentoAlvo.baixaId) return false;
                if (pagamentoAlvo.pagamentoCredorId && b.pagamentoCredorId === pagamentoAlvo.pagamentoCredorId) return false;
                if (b.valorPago === pagamentoAlvo.valor) return false;
                return true;
              });

              return recalcularCompra({
                ...compra,
                baixas: novasBaixas,
              });
            });

            const credorAtualizado: Credor = {
              ...remoto,
              compras: comprasAtualizadas,
              pagamentos: novosPagamentos,
            };

            t.set(ref, credorAtualizado);
            if (pagamentoAlvo.transacaoFinanceiraId) {
              t.delete(doc(db, "financeiro", pagamentoAlvo.transacaoFinanceiraId));
            }

            return { credorAtualizado, financeiroId: pagamentoAlvo.transacaoFinanceiraId };
          });

          aplicarLocal(resultado.credorAtualizado);
          if (resultado.financeiroId) {
            useFinanceiroStore.getState().removerTransacaoLocal(resultado.financeiroId);
          }
        },

        converterPedidoParaFiado: async ({
          clienteId,
          nomeCliente,
          whatsappCliente,
          pedidoId,
          origem,
          descricaoItens,
          valorTotal,
          dataPedido,
          dataPrometida,
          frequenciaLembrete,
          itens,
          sinal,
        }) => {
          const state = get();
          const foneNovo = whatsappCliente ? whatsappCliente.replace(/\D/g, '') : '';
          const existente = state.credores.find((c) => {
            const foneExist = c.whatsapp ? c.whatsapp.replace(/\D/g, '') : '';
            return (foneNovo && foneExist && foneNovo === foneExist) || (c.clienteId && clienteId && c.clienteId === clienteId);
          });

          const orderNumStr = numeroPedidoPorId(pedidoId);
          const dataBase = dataPedido ? dataPedido.slice(0, 10) : getLocalDateStr();
          const dataPrometidaDefault = dataPrometida || (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return getLocalDateStr(d);
          })();

          const valorSinal = sinal && sinal.valor > 0 ? sinal.valor : 0;
          const baixas = valorSinal > 0 ? [{
            id: crypto.randomUUID(),
            valorPago: valorSinal,
            dataBaixa: dataBase,
            formaPagamento: sinal!.formaPagamento,
            observacao: `Sinal / Pagamento Parcial: R$ ${valorSinal.toFixed(2).replace(".", ",")} (${sinal!.formaPagamento.toUpperCase()})`,
          }] : [];

          const novaCompraBruta: CompraCredor = {
            id: crypto.randomUUID(),
            origem,
            referenciaId: pedidoId,
            descricao: orderNumStr ? `${descricaoItens} (${orderNumStr})` : descricaoItens,
            itens: itens || [],
            valor: valorTotal,
            valorPendente: valorTotal,
            status: 'PENDENTE',
            pago: false,
            baixas,
            data: dataBase,
            dataPrometida: dataPrometidaDefault,
            frequenciaLembrete: frequenciaLembrete || 'vencimento',
            ultimoLembreteEm: null,
          };
          const novaCompra = recalcularCompra(novaCompraBruta);

          const credorId = existente?.id ?? crypto.randomUUID();

          const credorAtualizado = await runTransaction(db, async (t) => {
            const ref = doc(db, "credores", credorId);
            const snap = await t.get(ref);
            const remoto = snap.exists() ? ({ id: credorId, ...(snap.data() as CredorRemoto) } as Credor) : null;

            let pedidoExiste = false;
            if (pedidoId) {
              const ps = await t.get(doc(db, "pedidos", pedidoId));
              pedidoExiste = ps.exists();
            }

            const base: Credor = remoto ?? existente ?? {
              id: credorId,
              clienteId,
              nome: nomeCliente,
              whatsapp: foneNovo,
              observacoes: `Criado automaticamente via ${origem} ${orderNumStr}`,
              compras: [],
              pagamentos: [],
            };

            const atualizado: Credor = {
              ...base,
              compras: [...(base.compras || []).filter((c) => c.id !== novaCompra.id), novaCompra],
            };
            t.set(ref, atualizado);

            if (pedidoId && pedidoExiste) {
              const pedidoFiado: Record<string, unknown> = { status: "concluido", isFiado: true };
              if (novaCompra.pago) {
                pedidoFiado.dataPagamento = dataBase;
              }
              t.set(doc(db, "pedidos", pedidoId), pedidoFiado, { merge: true });
            }

            return atualizado;
          });

          aplicarLocal(credorAtualizado);
        },

        alternarStatusPagamento: async (credorId, compraId, acaoReabrir) => {
          const alvo = encontrarCredor(get().credores, credorId, compraId);
          if (!alvo) {
            throw new Error("Compra não encontrada.");
          }
          try {
            const atualizado = await aplicarEdicaoCredor(
              alvo,
              (base) => ({
                ...base,
                compras: (base.compras || []).map((compra) => {
                  if (compra.id !== compraId) return compra;
                  const novoPago = !compra.pago;
                  return recalcularCompra({
                    ...compra,
                    pago: novoPago,
                    baixas: novoPago && compra.valorPendente && compra.valorPendente > 0 ? [
                      ...(compra.baixas || []),
                      {
                        id: crypto.randomUUID(),
                        valorPago: compra.valorPendente,
                        dataBaixa: getLocalDateStr(),
                        formaPagamento: 'PIX',
                        observacao: 'Quitação manual',
                      }
                    ] : compra.baixas,
                  });
                }),
              }),
              { permitirReverter: acaoReabrir }
            );
            aplicarLocal(atualizado);
          } catch (err) {
            notifyError("Erro", erroAmigavel(err, "Não foi possível alterar o status da compra."));
            throw err;
          }
        },
      };
    },
    {
      name: 'ilma-doces-credores',
      migrate: (persistedState: any, version: number) => {
        if (persistedState && persistedState.credores) {
          persistedState.credores = persistedState.credores.map((c: any) => ({
            ...c,
            compras: (c.compras || []).map((compra: any) => {
              const base = {
                ...compra,
                baixas: compra.baixas || [],
                dataPrometida: compra.dataPrometida || (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  return getLocalDateStr(d);
                })(),
                frequenciaLembrete: compra.frequenciaLembrete || 'vencimento',
                ultimoLembreteEm: compra.ultimoLembreteEm ?? null,
                itens: compra.itens || [],
              };
              return recalcularCompra(base);
            }),
            pagamentos: c.pagamentos || [],
          }));
        }
        return persistedState;
      },
      version: 2,
    }
  )
);
