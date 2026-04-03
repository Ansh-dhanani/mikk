import { expect, test } from "bun:test";

test("smoke test - intent-engine", () => {
    expect(true).toBe(true);
});

test("intent-engine test runtime is Bun", () => {
    expect(typeof process.versions.bun).toBe("string");
});
