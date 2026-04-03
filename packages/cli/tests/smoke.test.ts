import { expect, test } from "bun:test";

test("smoke test - cli", () => {
    expect(true).toBe(true);
});

test("cli test runtime is Bun", () => {
    expect(typeof process.versions.bun).toBe("string");
});
