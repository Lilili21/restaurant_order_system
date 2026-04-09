export const AGOROT_PER_SHEKEL = 100;
export const BPS_BASE = 10_000;

export type Currency = "ILS";
export type Agorot = number;
export type Bps = number;

export type CartCalculationItem = {
  id: string;
  name: string;
  unitPriceAgorot: Agorot;
  quantity: number;
};

export type Discount =
  | {
      type: "percent";
      valueBps: Bps;
      label?: string;
      appliesToItemIds?: string[];
    }
  | {
      type: "fixed";
      valueAgorot: Agorot;
      label?: string;
      appliesToItemIds?: string[];
    };

export type CartCalculationResult = {
  currency: Currency;
  subtotalAgorot: Agorot;
  totalDiscountAgorot: Agorot;
  totalAgorot: Agorot;
  lines: {
    itemId: string;
    name: string;
    quantity: number;
    unitPriceAgorot: Agorot;
    lineSubtotalAgorot: Agorot;
    lineDiscountAgorot: Agorot;
    lineTotalAgorot: Agorot;
  }[];
  discounts: {
    label: string;
    amountAgorot: Agorot;
  }[];
};

function clampInteger(value: unknown, min = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.trunc(value));
}

function toBigInt(value: number) {
  return BigInt(clampInteger(value));
}

function roundBigIntDivision(numerator: bigint, denominator: bigint) {
  const ZERO = BigInt(0);
  const TWO = BigInt(2);
  const ONE = BigInt(1);

  if (denominator <= ZERO) {
    return ZERO;
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * TWO >= denominator ? quotient + ONE : quotient;
}

function sumAgorot(values: number[]) {
  return values.reduce((sum, value) => sum + clampInteger(value), 0);
}

function normalizeBps(value: number) {
  return Math.min(BPS_BASE, Math.max(0, clampInteger(value)));
}

function discountLabel(discount: Discount) {
  if (discount.label?.trim()) {
    return discount.label.trim();
  }

  if (discount.type === "fixed") {
    return "Discount";
  }

  const bps = normalizeBps(discount.valueBps);
  const integerPart = Math.trunc(bps / 100);
  const fractionPart = bps % 100;
  const fractionText = fractionPart.toString().padStart(2, "0");
  return fractionPart === 0
    ? `-${integerPart}%`
    : `-${integerPart}.${fractionText}%`;
}

function normalizeDiscount(discount: Discount): Discount {
  if (discount.type === "fixed") {
    return {
      ...discount,
      valueAgorot: clampInteger(discount.valueAgorot)
    };
  }

  return {
    ...discount,
    valueBps: normalizeBps(discount.valueBps)
  };
}

function allocateDiscountAcrossLines(
  lineBases: Array<{ index: number; baseAgorot: number }>,
  targetDiscountAgorot: number
) {
  const boundedTarget = Math.max(0, Math.trunc(targetDiscountAgorot));
  const totalBaseAgorot = sumAgorot(lineBases.map((line) => line.baseAgorot));

  if (boundedTarget === 0 || totalBaseAgorot === 0 || lineBases.length === 0) {
    return {
      allocations: new Map<number, number>(),
      appliedDiscountAgorot: 0
    };
  }

  const totalBaseBigInt = toBigInt(totalBaseAgorot);
  const targetBigInt = toBigInt(Math.min(boundedTarget, totalBaseAgorot));

  const baseAllocations = lineBases.map((line) => {
    const baseBigInt = toBigInt(line.baseAgorot);
    const numerator = targetBigInt * baseBigInt;
    const allocated = numerator / totalBaseBigInt;
    const remainder = numerator % totalBaseBigInt;

    return {
      index: line.index,
      allocated: Number(allocated),
      remainder
    };
  });

  const allocatedTotal = sumAgorot(baseAllocations.map((entry) => entry.allocated));
  let leftToDistribute = Math.max(0, Number(targetBigInt) - allocatedTotal);

  if (leftToDistribute > 0) {
    baseAllocations
      .slice()
      .sort((left, right) => {
        if (left.remainder > right.remainder) {
          return -1;
        }
        if (left.remainder < right.remainder) {
          return 1;
        }

        return left.index - right.index;
      })
      .forEach((entry) => {
        if (leftToDistribute <= 0) {
          return;
        }

        entry.allocated += 1;
        leftToDistribute -= 1;
      });
  }

  const allocations = new Map<number, number>();
  let appliedDiscountAgorot = 0;

  for (const entry of baseAllocations) {
    const lineBase = lineBases.find((line) => line.index === entry.index)?.baseAgorot ?? 0;
    const bounded = Math.max(0, Math.min(entry.allocated, lineBase));
    allocations.set(entry.index, bounded);
    appliedDiscountAgorot += bounded;
  }

  return {
    allocations,
    appliedDiscountAgorot
  };
}

export function shekelsToAgorot(value: number): Agorot {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(
    roundBigIntDivision(BigInt(Math.round(value * 10_000)), BigInt(100))
  );
}

export function agorotToShekels(value: number): number {
  return clampInteger(value) / AGOROT_PER_SHEKEL;
}

export function normalizeShekels(value: number): number {
  return agorotToShekels(shekelsToAgorot(value));
}

export function percentToBps(percent: number): Bps {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return normalizeBps(Math.round(percent * 100));
}

export function formatAgorotToILS(
  value: number,
  options?: {
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  const amountInShekels = agorotToShekels(value);
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2;

  return new Intl.NumberFormat(options?.locale ?? "ru-RU", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amountInShekels);
}

export function calculatePercentDiscountAgorot(
  amountAgorot: number,
  valueBps: number
): Agorot {
  const boundedAmount = clampInteger(amountAgorot);
  const boundedBps = normalizeBps(valueBps);

  if (boundedAmount <= 0 || boundedBps <= 0) {
    return 0;
  }

  return Number(
    roundBigIntDivision(
      toBigInt(boundedAmount) * toBigInt(boundedBps),
      BigInt(BPS_BASE)
    )
  );
}

export function multiplyAgorot(
  unitPriceAgorot: number,
  quantity: number
): Agorot {
  const boundedUnitPrice = clampInteger(unitPriceAgorot);
  const boundedQuantity = Math.max(0, clampInteger(quantity));
  return boundedUnitPrice * boundedQuantity;
}

export function calculateCartTotal(
  items: CartCalculationItem[],
  discountsInput: Discount[] = []
): CartCalculationResult {
  const lines = items.map((item) => {
    const quantity = Math.max(0, clampInteger(item.quantity));
    const unitPriceAgorot = clampInteger(item.unitPriceAgorot);
    const lineSubtotalAgorot = multiplyAgorot(unitPriceAgorot, quantity);

    return {
      itemId: item.id,
      name: item.name,
      quantity,
      unitPriceAgorot,
      lineSubtotalAgorot,
      lineDiscountAgorot: 0,
      lineTotalAgorot: lineSubtotalAgorot
    };
  });

  const subtotalAgorot = sumAgorot(lines.map((line) => line.lineSubtotalAgorot));
  const normalizedDiscounts = discountsInput.map(normalizeDiscount);
  const appliedDiscounts: Array<{ label: string; amountAgorot: number }> = [];

  for (const discount of normalizedDiscounts) {
    const appliesTo = new Set(discount.appliesToItemIds ?? []);
    const eligibleLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.lineTotalAgorot > 0)
      .filter(({ line }) => appliesTo.size === 0 || appliesTo.has(line.itemId));

    if (eligibleLines.length === 0) {
      continue;
    }

    const eligibleTotalAgorot = sumAgorot(
      eligibleLines.map(({ line }) => line.lineTotalAgorot)
    );

    if (eligibleTotalAgorot <= 0) {
      continue;
    }

    const targetDiscountAgorot =
      discount.type === "percent"
        ? calculatePercentDiscountAgorot(eligibleTotalAgorot, discount.valueBps)
        : Math.min(clampInteger(discount.valueAgorot), eligibleTotalAgorot);

    if (targetDiscountAgorot <= 0) {
      continue;
    }

    const { allocations, appliedDiscountAgorot } = allocateDiscountAcrossLines(
      eligibleLines.map(({ index, line }) => ({
        index,
        baseAgorot: line.lineTotalAgorot
      })),
      targetDiscountAgorot
    );

    if (appliedDiscountAgorot <= 0) {
      continue;
    }

    for (const [lineIndex, lineDiscountAgorot] of allocations.entries()) {
      const line = lines[lineIndex];

      if (!line || lineDiscountAgorot <= 0) {
        continue;
      }

      line.lineDiscountAgorot += lineDiscountAgorot;
      line.lineTotalAgorot = Math.max(0, line.lineTotalAgorot - lineDiscountAgorot);
    }

    appliedDiscounts.push({
      label: discountLabel(discount),
      amountAgorot: appliedDiscountAgorot
    });
  }

  const totalDiscountAgorot = sumAgorot(
    lines.map((line) => line.lineDiscountAgorot)
  );
  const totalAgorot = Math.max(0, subtotalAgorot - totalDiscountAgorot);

  return {
    currency: "ILS",
    subtotalAgorot,
    totalDiscountAgorot,
    totalAgorot,
    lines,
    discounts: appliedDiscounts
  };
}
