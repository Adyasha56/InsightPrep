import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "../../src/utils/password";

describe("password hashing", () => {
  it("hashes a password and verifies it against the original", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    expect(hash).not.toBe("correct-horse-battery-staple");
    await expect(comparePassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    await expect(comparePassword("wrong-password", hash)).resolves.toBe(false);
  });
});
