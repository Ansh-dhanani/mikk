import { expect, test } from "bun:test";

test("smoke test - diagram-generator", () => {
    expect(true).toBe(true);
});

test("diagram-generator test runtime is Bun", () => {
    expect(typeof process.versions.bun).toBe("string");
});
