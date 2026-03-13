import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspace, restoreWorkspace, useWorkspace, writeJson } from "./helpers/test-env";

describe("menu-settings", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = createWorkspace("menu-settings");
    useWorkspace(workspace);
    vi.resetModules();
  });

  afterEach(() => {
    restoreWorkspace();
    vi.resetModules();
  });

  it("creates default settings with tokens for all tables", async () => {
    const { getMenuSettings } = await import("@/lib/menu-settings");

    const settings = getMenuSettings();

    expect(settings.tableCount).toBe(8);
    expect(settings.kitchenLoadWarningEnabled).toBe(false);
    expect(Object.keys(settings.tableTokens)).toHaveLength(8);
    expect(new Set(Object.values(settings.tableTokens)).size).toBe(8);
    expect(settings.tableTokens["1"]).toMatch(/^tbl_/);
  });

  it("preserves existing tokens and normalizes table count on update", async () => {
    writeJson(workspace, "data/menu-settings.json", {
      kitchenLoadWarningEnabled: true,
      tableCount: 2,
      tableTokens: {
        "1": "tbl_fixed_a",
        "2": "tbl_fixed_b"
      }
    });

    const { updateMenuSettings } = await import("@/lib/menu-settings");

    const settings = updateMenuSettings({ tableCount: 4 });

    expect(settings.tableCount).toBe(4);
    expect(settings.tableTokens["1"]).toBe("tbl_fixed_a");
    expect(settings.tableTokens["2"]).toBe("tbl_fixed_b");
    expect(settings.tableTokens["3"]).toMatch(/^tbl_/);
    expect(settings.tableTokens["4"]).toMatch(/^tbl_/);
  });

  it("repairs invalid persisted settings", async () => {
    writeJson(workspace, "data/menu-settings.json", {
      kitchenLoadWarningEnabled: "yes",
      tableCount: 500,
      tableTokens: {
        "1": "",
        "2": "tbl_valid"
      }
    });

    const { getMenuSettings } = await import("@/lib/menu-settings");

    const settings = getMenuSettings();
    const persisted = JSON.parse(
      readFileSync(path.join(workspace, "data/menu-settings.json"), "utf8")
    ) as { tableCount: number; tableTokens: Record<string, string> };

    expect(settings.tableCount).toBe(100);
    expect(settings.tableTokens["1"]).toMatch(/^tbl_/);
    expect(settings.tableTokens["2"]).toBe("tbl_valid");
    expect(persisted.tableCount).toBe(100);
    expect(persisted.tableTokens["1"]).toMatch(/^tbl_/);
  });
});
