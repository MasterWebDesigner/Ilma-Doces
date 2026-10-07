export interface Category {
  id: string;
  name: string;
  slug: string;
  display_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  ativo?: boolean;
  display_order: number;
  brand: string;
  isCustomWeight?: boolean;
  estoque?: number;
  estoqueMinimo?: number;
  estoqueCritico?: number;
  controlarEstoque?: boolean;
  precoCustoInicial?: number;
  cardapioRapido?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unidades?: number;
  notes?: string;
  is_brinde?: boolean;
  preco_unitario?: number;
}

export type OrderStatus = "pendente" | "confirmado" | "em_producao" | "pronto" | "saiu_entrega" | "concluido" | "recusado" | "cancelado";
export type DeliveryType = "retirada" | "entrega";
export type PaymentMethod = "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "fiado";

export interface Order {
  id: string;
  orderNumber?: string;
  origem?: "manual" | "site";
  customerName: string;
  customerPhone: string;
  items: CartItem[];
  total: number;
  peso_real_kg?: number;
  deliveryType: DeliveryType;
  address?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  generalNotes?: string;
  trocoPara?: number;
  valorPagoSinal?: number;
  formaPagamentoSinal?: PaymentMethod;
  sinalExigido?: boolean;
  valorSinal?: number;
  sinalPago?: boolean;
  valorSinalPago?: number;
  isFiado?: boolean;
  estoqueBaixado?: boolean;
  dataPagamento?: string;
}

export interface FidelidadeEvento {
  data: string;
  tipo: "resgate" | "ajuste" | "reset";
  saldo: number;
  brindes: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  status: "Ativa" | "Nova";
  referencia?: string;
  fidelidadeOffset?: number;
  fidelidadeEditadoEm?: string;
  fidelidadeResgates?: number;
  fidelidadeUltimoResgate?: string;
  fidelidadeHistorico?: FidelidadeEvento[];
}

// ──────────────── EXPENSE ────────────────
export interface Expense {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  vencimento?: string;
  entradaId?: string;
  parcela?: number;
  status: "Pago" | "Pendente" | "Em Atraso";
  createdAt: string;
}

// ──────────────── BRAND ────────────────
export interface Brand {
  id: string;
  nome: string;
  status: "Ativa" | "Inativa";
}

// ──────────────── ENTRADA DE MERCADORIA ────────────────
export interface EntradaItem {
  insumoId: string;
  nome: string;
  brandId: string;
  qtd: number;
  custoUnitario: number;
}

export interface EntradaParcela {
  numero: number;
  vencimento: string;
  valor: number;
}

export interface EntradaMercadoria {
  id: string;
  fornecedor: string;
  data: string;
  itens: EntradaItem[];
  subtotal: number;
  frete: number;
  total: number;
  formaPagamento: string;
  aVista?: boolean;
  parcelas: EntradaParcela[];
  criadoEm: string;
  despesaIds: string[];
  loteIds: string[];
}

// ──────────────── FICHA TECNICA ────────────────
export interface FichaTecnicaIngrediente {
  insumoId: string;
  nome: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
}

export interface FichaTecnica {
  id: string;
  productId: string;
  productName: string;
  ingredientes: FichaTecnicaIngrediente[];
  custoInvisivelPct: number;
  maoDeObraMin: number;
  maoDeObraValorHora: number;
  margemLucroPct: number;
  rendimento: number;
  unidadeRendimento: string;
  createdAt: string;
}

// ──────────────── CREDOR ────────────────
export interface CompraItem {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface BaixaCompra {
  id: string;
  valorPago: number;
  dataBaixa: string;
  formaPagamento: string;
  observacao?: string;
  transacaoFinanceiraId?: string;
  pagamentoCredorId?: string;
}

export interface CompraCredor {
  id: string;
  origem: "manual" | "pedido" | "agendamento";
  referenciaId?: string;
  descricao: string;
  itens?: CompraItem[];
  valor: number;
  valorPendente?: number;
  status?: "PENDENTE" | "QUITADO" | "CANCELADO";
  baixas?: BaixaCompra[];
  data: string;
  dataPrometida?: string;
  frequenciaLembrete?: "diario" | "2_dias" | "3_dias" | "semanal" | "vencimento";
  ultimoLembreteEm?: string | null;
  pago: boolean;
}

export interface PagamentoCredor {
  id: string;
  valor: number;
  data: string;
  metodo: string;
  observacao?: string;
  transacaoFinanceiraId?: string;
  baixaId?: string;
  pagamentoCredorId?: string;
}

export interface Credor {
  id: string;
  clienteId: string;
  nome: string;
  whatsapp: string;
  observacoes?: string;
  limiteCredito?: number;
  compras: CompraCredor[];
  pagamentos: PagamentoCredor[];
}

// ──────────────── FINANCIAL TRANSACTION ────────────────
export interface FinancialTransaction {
  id: string;
  tipo: "RECEITA" | "DESPESA";
  categoria: string;
  valor: number;
  formaPagamento: string;
  descricao: string;
  data: string;
  createdAt: string;
  pedidoId?: string;
}
