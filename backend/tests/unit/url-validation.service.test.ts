import { describe, expect, it } from "vitest";
import { validateCompanyUrl } from "../../src/services/retrieval/url-validation.service";
import { AppError } from "../../src/utils/AppError";

describe("validateCompanyUrl", () => {
  it("rejects a malformed URL", async () => {
    await expect(validateCompanyUrl("not a url")).rejects.toThrow(AppError);
  });

  it("rejects unsupported protocols", async () => {
    await expect(validateCompanyUrl("ftp://example.com")).rejects.toThrow(AppError);
  });

  it("rejects loopback and private-network URLs by default (SSRF protection)", async () => {
    await expect(validateCompanyUrl("http://localhost:5000")).rejects.toThrow(AppError);
    await expect(validateCompanyUrl("http://127.0.0.1")).rejects.toThrow(AppError);
    await expect(validateCompanyUrl("http://192.168.1.10")).rejects.toThrow(AppError);
    await expect(validateCompanyUrl("http://[::1]")).rejects.toThrow(AppError);
  });

  it("allows localhost when explicitly enabled for evaluator/local mode", async () => {
    const result = await validateCompanyUrl("http://localhost:4000/company", { allowLocalTargets: true });
    expect(result.hostname).toBe("localhost");
  });

  it("accepts a well-formed public URL", async () => {
    const result = await validateCompanyUrl("https://example.com/careers", { allowLocalTargets: true });
    expect(result.href).toBe("https://example.com/careers");
  });
});
