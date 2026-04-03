import { expect, test } from "bun:test";

test("smoke test - ai-context", () => {
    expect(true).toBe(true);
});

test("ai-context test runtime is Bun", () => {
    expect(typeof process.versions.bun).toBe("string");
});
