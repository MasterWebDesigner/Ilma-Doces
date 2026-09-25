// ═══════════ UNIT GROUPS ═══════════

type UnitGroup = "high_precision" | "simple_precision" | "integer";

const UNIT_GROUP_MAP: Record<string, UnitGroup> = {
  kg: "high_precision",
  L: "high_precision",
  g: "simple_precision",
  ml: "simple_precision",
  lata: "simple_precision",
  caixa: "simple_precision",
  duzia: "simple_precision",
  un: "integer",
  pct: "integer",
  folha: "integer",
};

export function getUnitGroup(unit: string): UnitGroup {
  return UNIT_GROUP_MAP[unit] ?? "simple_precision";
}

export function getStep(unit: string): string {
  const group = getUnitGroup(unit);
  if (group === "high_precision") return "0.001";
  if (group === "integer") return "1";
  return "0.1";
}

export function getDecimals(unit: string): number {
  const group = getUnitGroup(unit);
  if (group === "high_precision") return 3;
  if (group === "integer") return 0;
  return 1;
}

export function formatQty(value: number, unit: string): string {
  const decimals = getDecimals(unit);
  return value.toFixed(decimals).replace(".", ",");
}

export function formatPrice(value: number): string {
  return value.toFixed(3).replace(".", ",");
}

// ═══════════ UNIT CONVERSION HELPERS ═══════════

// Package equivalences (grams)
export const EMBALAGEM_GRAMAS: Record<string, number> = {
  lata: 395,
  caixa: 200,
};

// Units available for consumption in ficha tecnica, grouped by what the stock unit supports
export function getConsumptionUnits(stockUnit: string): { value: string; label: string; step: string }[] {
  const group = getUnitGroup(stockUnit);

  if (group === "high_precision") {
    // kg/L → can consume in g/ml or kg/L
    if (stockUnit === "kg") {
      return [
        { value: "g", label: "Gramas (g)", step: "0.1" },
        { value: "kg", label: "Quilogramas (kg)", step: "0.001" },
      ];
    }
    // L
    return [
      { value: "ml", label: "Mililitros (ml)", step: "0.1" },
      { value: "L", label: "Litros (L)", step: "0.001" },
    ];
  }

  if (stockUnit === "lata" || stockUnit === "caixa") {
    // Can consume by fraction of package or by grams
    return [
      { value: stockUnit, label: stockUnit === "lata" ? "Lata(s)" : "Caixa(s)", step: "0.1" },
      { value: "g", label: "Gramas (g)", step: "0.1" },
    ];
  }

  if (stockUnit === "duzia") {
    return [
      { value: "un", label: "Unidade(s) (un)", step: "1" },
    ];
  }

  // Integer units (un, pct, folha) — direct consumption
  if (group === "integer") {
    return [
      { value: stockUnit, label: getUnitLabel(stockUnit), step: "1" },
    ];
  }

  // Simple precision (g, ml)
  return [
    { value: stockUnit, label: getUnitLabel(stockUnit), step: "0.1" },
  ];
}

function getUnitLabel(unit: string): string {
  const labels: Record<string, string> = {
    un: "Unidade(s)",
    g: "Gramas (g)",
    ml: "Mililitros (ml)",
    kg: "Quilogramas (kg)",
    L: "Litros (L)",
    lata: "Lata(s)",
    caixa: "Caixa(s)",
    duzia: "Duzia(s)",
    pct: "Pacote(s)",
    folha: "Folha(s)",
  };
  return labels[unit] || unit;
}

// Convert consumption quantity to stock unit quantity (for PEPS deduction)
export function convertToStockQty(consumeQty: number, consumeUnit: string, stockUnit: string): number {
  // Same unit → direct
  if (consumeUnit === stockUnit) return consumeQty;

  // g → kg: divide by 1000
  if (consumeUnit === "g" && stockUnit === "kg") return consumeQty / 1000;

  // ml → L: divide by 1000
  if (consumeUnit === "ml" && stockUnit === "L") return consumeQty / 1000;

  // lata → g: multiply by 395
  if (consumeUnit === "lata" && stockUnit === "g") return consumeQty * EMBALAGEM_GRAMAS.lata;

  // caixa → g: multiply by 200
  if (consumeUnit === "caixa" && stockUnit === "g") return consumeQty * EMBALAGEM_GRAMAS.caixa;

  // g in lata/caixa stock: divide by equivalence
  if (consumeUnit === "g" && (stockUnit === "lata" || stockUnit === "caixa")) {
    return consumeQty / EMBALAGEM_GRAMAS[stockUnit];
  }

  // duzia → un: divide by 12
  if (consumeUnit === "un" && stockUnit === "duzia") return consumeQty / 12;

  // Fallback: 1:1
  return consumeQty;
}

// Get cost per consume unit from stock unit cost
export function convertCostToConsumeUnit(
  stockCostPerUnit: number,
  stockUnit: string,
  consumeUnit: string
): number {
  // Same unit
  if (consumeUnit === stockUnit) return stockCostPerUnit;

  // g → kg: cost per g = cost per kg / 1000
  if (consumeUnit === "g" && stockUnit === "kg") return stockCostPerUnit / 1000;

  // ml → L: cost per ml = cost per L / 1000
  if (consumeUnit === "ml" && stockUnit === "L") return stockCostPerUnit / 1000;

  // lata → g: cost per g = cost per lata / 395
  if (consumeUnit === "g" && stockUnit === "lata") return stockCostPerUnit / EMBALAGEM_GRAMAS.lata;

  // caixa → g: cost per g = cost per caixa / 200
  if (consumeUnit === "g" && stockUnit === "caixa") return stockCostPerUnit / EMBALAGEM_GRAMAS.caixa;

  // g in lata stock: cost per lata = cost per g * 395
  if (consumeUnit === "lata" && stockUnit === "g") return stockCostPerUnit * EMBALAGEM_GRAMAS.lata;

  // g in caixa stock: cost per caixa = cost per g * 200
  if (consumeUnit === "caixa" && stockUnit === "g") return stockCostPerUnit * EMBALAGEM_GRAMAS.caixa;

  // un → duzia: cost per un = cost per duzia / 12
  if (consumeUnit === "un" && stockUnit === "duzia") return stockCostPerUnit / 12;

  // Fallback
  return stockCostPerUnit;
}

// ═══════════ FICHA TECNICA COST CONVERSION ═══════════

export const CONVERSOES: Record<string, number> = {
  xicara: 240,
  colher_sopa: 15,
  colher_cha: 5,
  pitada: 1,
};

export function converterCustoFicha(
  qtdReceita: number,
  unReceita: string,
  custoUnitEstoque: number,
  unEstoque: string
): number {
  if (CONVERSOES[unReceita]) {
    const fator = CONVERSOES[unReceita];
    const qtdBase = qtdReceita * fator;
    const baseUnit = unEstoque === "kg" || unEstoque === "g" ? "g" : "ml";
    const costPerBaseUnit = convertCostToConsumeUnit(custoUnitEstoque, unEstoque, baseUnit);
    return qtdBase * costPerBaseUnit;
  }

  const costPerConsumeUnit = convertCostToConsumeUnit(custoUnitEstoque, unEstoque, unReceita);
  return qtdReceita * costPerConsumeUnit;
}

// All available stock units for the insumo form
export const ALL_STOCK_UNITS = [
  { value: "kg", label: "kg (quilograma)" },
  { value: "g", label: "g (grama)" },
  { value: "L", label: "L (litro)" },
  { value: "ml", label: "ml (mililitro)" },
  { value: "lata", label: "lata" },
  { value: "caixa", label: "caixa" },
  { value: "duzia", label: "duzia" },
  { value: "un", label: "un (unidade)" },
  { value: "pct", label: "pct (pacote)" },
  { value: "folha", label: "folha" },
];
