import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinanceiroStore } from './financeiroStore';
import { getLocalDateStr, paymentLabelOf } from './utils';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Credor, CompraCredor, CompraItem, BaixaCompra, PagamentoCredor } from '@/types/database';

if (typeof window !== "undefined") {
  onSnapshot(collection(db, "credores"), (snapshot) => {
    const credores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Credor));
    useCredoresStore.setState({ credores });
  });
}

function syncCredor(credor: Credor) {
  if (credor && credor.id) {
    setDoc(doc(db, "credores", credor.id), credor);
  }
}

function recalcularCompra(compra: CompraCredor): CompraCredor {
  const totalBaixas = (compra.baixas || []).reduce((acc, b) => acc + (Number(b.valorPago) || 0), 0);
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

interface CredoresState {
  credores: Credor[];
  adicionarCredor: (credor: Omit<Credor, 'id' | 'compras' | 'pagamentos'>) => string;
  editarCredor: (id: string, dados: Partial<Omit<Credor, 'id' | 'compras' | 'pagamentos'>>) => void;
  removerCredor: (id: string) => void;
  adicionarCompra: (credorId: string, compra: Omit<CompraCredor, 'id' | 'pago'>) => void;
  editarCompra: (credorId: string, compraId: string, dados: Partial<CompraCredor>) => void;
  removerCompra: (credorId: string, compraId: string) => void;
  registrarBaixaCompra: (credorId: string, compraId: string, valorPago: number, formaPagamento: string, dataBaixa: string) => void;
  removerPagamento: (credorId: string, pagamentoId: string) => void;
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
      itens?: CompraItem[];
      sinal?: {
        valor: number;
        formaPagamento: string;
      };
    }) => void;
  alternarStatusPagamento: (credorId: string, compraId: string) => void;
}

export const useCredoresStore = create<CredoresState>()(
  persist(
    (set, get) => ({
      credores: [],

      adicionarCredor: (dados) => {
        const state = get();
        const foneNovo = dados.whatsapp ? dados.whatsapp.replace(/\D/g, '') : '';
        const existente = state.credores.find((c) => {
          const foneExistente = c.whatsapp ? c.whatsapp.replace(/\D/g, '') : '';
          return (foneNovo && foneExistente && foneNovo === foneExistente) || (c.clienteId && dados.clienteId && c.clienteId === dados.clienteId);
        });
        if (existente) {
          if (dados.nome && dados.nome.trim()) {
            existente.nome = dados.nome.trim();
          }
          if (dados.whatsapp && dados.whatsapp.trim()) {
            existente.whatsapp = dados.whatsapp.trim();
          }
          syncCredor(existente);
          return existente.id;
        }

        const id = crypto.randomUUID();
        const novoCredor: Credor = { ...dados, nome: dados.nome.trim(), whatsapp: foneNovo, id, compras: [], pagamentos: [] };
        syncCredor(novoCredor);
        set((state) => ({
          credores: [...state.credores, novoCredor],
        }));
        return id;
      },

      editarCredor: (id, dados) =>
        set((state) => {
          const credores = state.credores.map((c) => {
            if (c.id === id) {
              const updated = { ...c, ...dados };
              syncCredor(updated);
              return updated;
            }
            return c;
          });
          return { credores };
        }),

      removerCredor: (id) => {
        if (id) {
          deleteDoc(doc(db, "credores", id));
        }
        set((state) => ({
          credores: state.credores.filter((c) => c.id !== id),
        }));
      },

      adicionarCompra: (credorId, compra) =>
        set((state) => ({
          credores: state.credores.map((c) => {
            const match = c.id === credorId || (c.compras || []).some(comp => comp.id === credorId);
            if (!match) return c;
            const novaCompra: CompraCredor = {
              ...compra,
              id: crypto.randomUUID(),
              valorPendente: compra.valor,
              status: 'PENDENTE',
              pago: false,
              baixas: [],
              dataPrometida: compra.dataPrometida || (() => {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                return getLocalDateStr(d);
              })(),
            };
            const atualizada = recalcularCompra(novaCompra);
            const updated = {
              ...c,
              compras: [...(c.compras || []), atualizada],
            };
            syncCredor(updated);
            return updated;
          }),
        })),

      editarCompra: (credorId, compraId, dados) =>
        set((state) => ({
          credores: state.credores.map((c) => {
            const hasCompra = c.id === credorId || (c.compras || []).some((comp) => comp.id === compraId);
            if (!hasCompra) return c;
            const novasCompras = (c.compras || []).map((compra) =>
              compra.id === compraId ? recalcularCompra({ ...compra, ...dados }) : compra
            );
            const updated = {
              ...c,
              compras: novasCompras,
            };
            syncCredor(updated);
            return updated;
          }),
        })),

      removerCompra: (credorId, compraId) =>
        set((state) => ({
          credores: state.credores.map((c) => {
            const hasCompra = c.id === credorId || (c.compras || []).some((comp) => comp.id === compraId);
            if (!hasCompra) return c;
            const novasCompras = (c.compras || []).filter((compra) => compra.id !== compraId);
            const updated = {
              ...c,
              compras: novasCompras,
            };
            syncCredor(updated);
            return updated;
          }),
        })),

      registrarBaixaCompra: (credorId, compraId, valorPago, formaPagamento, dataBaixa) => {
        const dataBaixaStr = dataBaixa ? dataBaixa.slice(0, 10) : getLocalDateStr();
        const state = get();
        let targetCredor: Credor | undefined;
        let targetCompra: CompraCredor | undefined;

        for (const c of state.credores) {
          if (c.id === credorId || (c.compras || []).some(comp => comp.id === compraId)) {
            targetCredor = c;
            targetCompra = (c.compras || []).find(comp => comp.id === compraId);
            break;
          }
        }

        if (!targetCredor || !targetCompra) return;

        const valorPendenteAtual = targetCompra.valorPendente !== undefined ? targetCompra.valorPendente : targetCompra.valor;
        if (valorPago > valorPendenteAtual + 0.01) {
          throw new Error(`O valor pago (R$ ${valorPago.toFixed(2)}) não pode ser maior que o saldo pendente (R$ ${valorPendenteAtual.toFixed(2)})!`);
        }

        const nomeCredor = targetCredor.nome;
        const pagamentoCategoria = paymentLabelOf(formaPagamento);

        let refOrderNum = "";
        if (targetCompra.referenciaId) {
          try {
            const cached = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("ilma-orders") || "{}")?.state?.orders : [];
            const ord = (cached || []).find((o: any) => o.id === targetCompra.referenciaId);
            if (ord && ord.orderNumber) {
              refOrderNum = `#${ord.orderNumber}`;
            }
          } catch (e) {}
        }
        if (!refOrderNum && targetCompra.referenciaId) {
          refOrderNum = `#${targetCompra.referenciaId.slice(-6)}`;
        }
        const obsBaixa = refOrderNum ? `Baixa na compra ${refOrderNum}` : `Baixa na compra #${compraId.slice(0, 6)}`;

        const finId = useFinanceiroStore.getState().addTransaction({
          tipo: 'RECEITA',
          categoria: pagamentoCategoria,
          valor: valorPago,
          formaPagamento: paymentLabelOf(formaPagamento),
          descricao: `Baixa Credor (${paymentLabelOf(formaPagamento)}) — ${nomeCredor}`,
          data: dataBaixaStr,
        });

        const baixaId = crypto.randomUUID();
        const pagamentoId = crypto.randomUUID();

        const novaBaixa: BaixaCompra = {
          id: baixaId,
          valorPago,
          dataBaixa: dataBaixaStr,
          formaPagamento,
          observacao: obsBaixa,
          transacaoFinanceiraId: finId,
          pagamentoCredorId: pagamentoId,
        };

        const novoPagamento: PagamentoCredor = {
          id: pagamentoId,
          valor: valorPago,
          data: dataBaixaStr,
          metodo: formaPagamento,
          observacao: obsBaixa,
          transacaoFinanceiraId: finId,
          baixaId,
        };

        set((state) => {
          const novosCredores = state.credores.map((credor) => {
            const hasThisCompra = credor.id === credorId || (credor.compras || []).some(comp => comp.id === compraId);
            if (!hasThisCompra) return credor;

            const comprasAtualizadas = (credor.compras || []).map((compra) => {
              if (compra.id === compraId) {
                const compraComNovaBaixa = {
                  ...compra,
                  baixas: [...(compra.baixas || []), novaBaixa],
                };
                const recalculada = recalcularCompra(compraComNovaBaixa);

                if (compra.referenciaId) {
                  try {
                    const pedidoUpdate: Record<string, unknown> = { status: "concluido" };
                    if (recalculada.pago) {
                      pedidoUpdate.dataPagamento = dataBaixaStr;
                    }
                    updateDoc(doc(db, "pedidos", compra.referenciaId), pedidoUpdate);
                  } catch (e) {}
                }

                return recalculada;
              }
              return compra;
            });

            const updatedCredor = {
              ...credor,
              compras: comprasAtualizadas,
              pagamentos: [novoPagamento, ...(credor.pagamentos || [])],
            };
            syncCredor(updatedCredor);
            return updatedCredor;
          });
          return { credores: novosCredores };
        });
      },

      removerPagamento: (credorId, pagamentoId) => {
        set((state) => {
          const novosCredores = state.credores.map((credor) => {
            const hasPagamento = credor.id === credorId || (credor.pagamentos || []).some((p) => p.id === pagamentoId);
            if (!hasPagamento) return credor;

            const pagamentoAlvo = (credor.pagamentos || []).find((p) => p.id === pagamentoId);
            const novosPagamentos = (credor.pagamentos || []).filter((p) => p.id !== pagamentoId);

            if (pagamentoAlvo?.transacaoFinanceiraId) {
              try {
                useFinanceiroStore.getState().deleteTransaction(pagamentoAlvo.transacaoFinanceiraId);
              } catch (e) {}
            }

            const comprasAtualizadas = (credor.compras || []).map((compra) => {
              const temBaixaCorrespondente = (compra.baixas || []).some((b) => {
                if (pagamentoAlvo?.baixaId && b.id === pagamentoAlvo.baixaId) return true;
                if (pagamentoAlvo?.pagamentoCredorId && b.pagamentoCredorId === pagamentoAlvo.pagamentoCredorId) return true;
                if (pagamentoAlvo && b.valorPago === pagamentoAlvo.valor) return true;
                return false;
              });

              if (!temBaixaCorrespondente) return compra;

              const novasBaixas = (compra.baixas || []).filter((b) => {
                if (pagamentoAlvo?.baixaId && b.id === pagamentoAlvo.baixaId) return false;
                if (pagamentoAlvo?.pagamentoCredorId && b.pagamentoCredorId === pagamentoAlvo.pagamentoCredorId) return false;
                if (pagamentoAlvo && b.valorPago === pagamentoAlvo.valor) return false;
                return true;
              });

              return recalcularCompra({
                ...compra,
                baixas: novasBaixas,
              });
            });

            const updated = {
              ...credor,
              compras: comprasAtualizadas,
              pagamentos: novosPagamentos,
            };
            syncCredor(updated);
            return updated;
          });
          return { credores: novosCredores };
        });
      },

      converterPedidoParaFiado: ({
        clienteId,
        nomeCliente,
        whatsappCliente,
        pedidoId,
        origem,
        descricaoItens,
        valorTotal,
        dataPedido,
        dataPrometida,
        itens,
        sinal,
      }) => {
        const state = get();
        const foneNovo = whatsappCliente ? whatsappCliente.replace(/\D/g, '') : '';
        const credor = state.credores.find((c) => {
          const foneExist = c.whatsapp ? c.whatsapp.replace(/\D/g, '') : '';
          return (foneNovo && foneExist && foneNovo === foneExist) || (c.clienteId && clienteId && c.clienteId === clienteId);
        });
        let credorId = credor?.id;

        let orderNumStr = "";
        if (pedidoId) {
          try {
            const cached = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("ilma-orders") || "{}")?.state?.orders : [];
            const ord = (cached || []).find((o: any) => o.id === pedidoId);
            if (ord && ord.orderNumber) {
              orderNumStr = `#${ord.orderNumber}`;
            }
          } catch (e) {}
        }
        if (!orderNumStr && pedidoId) {
          orderNumStr = `#${pedidoId.slice(-6)}`;
        }

        if (!credorId) {
          credorId = state.adicionarCredor({
            clienteId,
            nome: nomeCliente,
            whatsapp: whatsappCliente,
            observacoes: `Criado automaticamente via ${origem} ${orderNumStr}`,
          });
        }

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
        };

        const novaCompra = recalcularCompra(novaCompraBruta);

        if (pedidoId) {
          try {
            const pedidoFiado: Record<string, unknown> = { status: "concluido", isFiado: true };
            if (novaCompra.pago) {
              pedidoFiado.dataPagamento = dataBase;
            }
            updateDoc(doc(db, "pedidos", pedidoId), pedidoFiado);
          } catch (e) {}
        }

        set((state) => {
          const credores = state.credores.map((c) => {
            if (c.id !== credorId) return c;
            const updated = {
              ...c,
              compras: [...(c.compras || []), novaCompra],
            };
            syncCredor(updated);
            return updated;
          });
          return { credores };
        });
      },

      alternarStatusPagamento: (credorId, compraId) =>
        set((state) => ({
          credores: state.credores.map((c) => {
            const hasCompra = c.id === credorId || (c.compras || []).some((comp) => comp.id === compraId);
            if (!hasCompra) return c;
            const updated = {
              ...c,
              compras: (c.compras || []).map((compra) => {
                if (compra.id === compraId) {
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
                }
                return compra;
              }),
            };
            syncCredor(updated);
            return updated;
          }),
        })),
    }),
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
                itens: compra.itens || [],
              };
              return recalcularCompra(base);
            }),
            pagamentos: c.pagamentos || [],
          }));
        }
        return persistedState;
      },
      version: 1,
    }
  )
);
