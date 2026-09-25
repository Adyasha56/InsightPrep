import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signAuthToken, verifyAuthToken } from "../../src/utils/jwt";
import { AppError } from "../../src/utils/AppError";

describe("auth tokens", () => {
  it("signs and verifies a token round-trip", () => {
    const token = signAuthToken("507f1f77bcf86cd799439011");
    const payload = verifyAuthToken(token);

    expect(payload.id).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects a malformed token", () => {
    expect(() => verifyAuthToken("not-a-real-token")).toThrow(AppError);
  });

  it("rejects an expired token", () => {
    const expiredToken = jwt.sign({}, process.env.JWT_SECRET as string, {
      subject: "507f1f77bcf86cd799439011",
      expiresIn: -10,
    });

    expect(() => verifyAuthToken(expiredToken)).toThrow(/expired/i);
  });
});
