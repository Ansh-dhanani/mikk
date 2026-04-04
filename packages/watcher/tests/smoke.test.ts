import { expect, test } from "bun:test";

test("smoke test - watcher", () => {
    expect(true).toBe(true);
});

test("watcher test runtime is Bun", () => {
    expect(typeof process.versions.bun).toBe("string");
});
