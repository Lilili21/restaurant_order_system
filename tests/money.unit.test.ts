import { describe, expect, it } from "vitest";

import {
  agorotToShekels,
  calculateCartTotal,
  formatAgorotToILS,
  percentToBps,
  shekelsToAgorot
} from "@/lib/money";

describe("money", () => {
  it("calculates simple cart item without discounts", () => {
    const result = calculateCartTotal([
      {
        id: "m1",
        name: "Item",
        unitPriceAgorot: shekelsToAgorot(32),
        quantity: 2
      }
    ]);

    expect(result.subtotalAgorot).toBe(6400);
    expect(result.totalDiscountAgorot).toBe(0);
    expect(result.totalAgorot).toBe(6400);
  });

  it("applies percent discount on one item", () => {
    const result = calculateCartTotal(
      [
        {
          id: "m1",
          name: "Item",
          unitPriceAgorot: shekelsToAgorot(32),
          quantity: 1
        }
      ],
      [
        {
          type: "percent",
          valueBps: percentToBps(20),
          appliesToItemIds: ["m1"]
        }
      ]
    );

    expect(result.totalDiscountAgorot).toBe(640);
    expect(agorotToShekels(result.totalAgorot)).toBe(25.6);
  });

  it("applies percent discount on full cart", () => {
    const result = calculateCartTotal(
      [
        { id: "m1", name: "A", unitPriceAgorot: 2400, quantity: 1 },
        { id: "m2", name: "B", unitPriceAgorot: 1800, quantity: 2 }
      ],
      [{ type: "percent", valueBps: percentToBps(10) }]
    );

    expect(result.subtotalAgorot).toBe(6000);
    expect(result.totalDiscountAgorot).toBe(600);
    expect(result.totalAgorot).toBe(5400);
  });

  it("applies fixed discount safely", () => {
    const result = calculateCartTotal(
      [
        { id: "m1", name: "A", unitPriceAgorot: 2000, quantity: 1 },
        { id: "m2", name: "B", unitPriceAgorot: 1500, quantity: 1 }
      ],
      [{ type: "fixed", valueAgorot: 700 }]
    );

    expect(result.subtotalAgorot).toBe(3500);
    expect(result.totalDiscountAgorot).toBe(700);
    expect(result.totalAgorot).toBe(2800);
  });

  it("handles multiple items and discount scope", () => {
    const result = calculateCartTotal(
      [
        { id: "starter", name: "Starter", unitPriceAgorot: 2400, quantity: 1 },
        { id: "drink", name: "Drink", unitPriceAgorot: 1800, quantity: 1 }
      ],
      [
        {
          type: "percent",
          valueBps: percentToBps(20),
          appliesToItemIds: ["starter"]
        }
      ]
    );

    const starterLine = result.lines.find((line) => line.itemId === "starter");
    const drinkLine = result.lines.find((line) => line.itemId === "drink");

    expect(starterLine?.lineDiscountAgorot).toBe(480);
    expect(drinkLine?.lineDiscountAgorot).toBe(0);
    expect(result.totalAgorot).toBe(3720);
  });

  it("keeps rounding deterministic on edge percentages", () => {
    const result = calculateCartTotal(
      [{ id: "m1", name: "Edge", unitPriceAgorot: 999, quantity: 1 }],
      [{ type: "percent", valueBps: 3333 }]
    );

    expect(result.totalDiscountAgorot).toBe(333);
    expect(result.totalAgorot).toBe(666);
  });

  it("keeps 32 ILS with 20 percent at 25.60", () => {
    const result = calculateCartTotal(
      [{ id: "m1", name: "Kanafeh", unitPriceAgorot: 3200, quantity: 1 }],
      [{ type: "percent", valueBps: 2000 }]
    );

    expect(result.totalAgorot).toBe(2560);
    expect(formatAgorotToILS(result.totalAgorot)).toContain("25");
  });

  it("does not leak raw float precision in formatting flow", () => {
    const agorot = shekelsToAgorot(0.333);
    const shekels = agorotToShekels(agorot);
    const formatted = formatAgorotToILS(agorot);

    expect(agorot).toBe(33);
    expect(shekels).toBe(0.33);
    expect(formatted.includes("0.333")).toBe(false);
  });

  it("keeps totals equal to sum of line totals and discounts", () => {
    const result = calculateCartTotal(
      [
        { id: "a", name: "A", unitPriceAgorot: 1234, quantity: 2 },
        { id: "b", name: "B", unitPriceAgorot: 777, quantity: 3 }
      ],
      [
        { type: "percent", valueBps: 1250 },
        { type: "fixed", valueAgorot: 255 }
      ]
    );

    const linesSubtotal = result.lines.reduce(
      (sum, line) => sum + line.lineSubtotalAgorot,
      0
    );
    const linesDiscount = result.lines.reduce(
      (sum, line) => sum + line.lineDiscountAgorot,
      0
    );
    const linesTotal = result.lines.reduce((sum, line) => sum + line.lineTotalAgorot, 0);

    expect(linesSubtotal).toBe(result.subtotalAgorot);
    expect(linesDiscount).toBe(result.totalDiscountAgorot);
    expect(linesTotal).toBe(result.totalAgorot);
    expect(result.totalAgorot).toBe(
      Math.max(0, result.subtotalAgorot - result.totalDiscountAgorot)
    );
  });
});
