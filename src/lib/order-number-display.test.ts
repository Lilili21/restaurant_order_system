import { describe, expect, it } from "vitest";

import {
  getGuestShortOrderNumber,
  getStaffShortOrderNumber
} from "./order-number-display";

describe("order number display helpers", () => {
  it("returns guest short number without prefix for standard long number", () => {
    expect(getGuestShortOrderNumber("BB-260414-1337218B6D")).toBe("2186");
  });

  it("returns guest short number from tail when digits are mixed", () => {
    expect(getGuestShortOrderNumber("ORD-260414-A1B2")).toBe("A1B2");
  });

  it("returns empty guest number for missing value", () => {
    expect(getGuestShortOrderNumber("")).toBe("");
    expect(getGuestShortOrderNumber(undefined)).toBe("");
  });

  it("returns staff short number with fallback when display number is missing", () => {
    expect(getStaffShortOrderNumber(undefined, "ord_1711000")).toBe("ord_1711000");
  });

  it("keeps full number available separately in UI logic", () => {
    const full = "BB-260414-1337218B6D";
    const short = getStaffShortOrderNumber(full, "ord_1");

    expect(short).toBe("2186");
    expect(full).toBe("BB-260414-1337218B6D");
  });
});
