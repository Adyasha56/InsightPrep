import dns from "dns/promises";
import { AppError } from "../../utils/AppError";
import { ErrorCode } from "../../types/error-code.types";
import { isPrivateOrReservedIpv4, isPrivateOrReservedIpv6 } from "../../utils/ip-range.utils";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const LOCALHOST_HOSTNAMES = new Set(["localhost"]);

function isBlockedHostnameLiteral(hostname: string): boolean {
  if (LOCALHOST_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return true;
  }

  // IPv6 literals arrive wrapped in brackets in URL#hostname, e.g. "[::1]".
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (unwrapped.includes(":")) {
    return isPrivateOrReservedIpv6(unwrapped);
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(unwrapped)) {
    return isPrivateOrReservedIpv4(unwrapped);
  }

  return false;
}

async function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  // A hostname can pass literal checks but still resolve to an internal
  // address (DNS rebinding), so the resolved IPs are classified too.
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    // Unresolvable hostnames fail later at fetch time with a clear
    // CONNECTION_ERROR; that is a research-pipeline failure, not an SSRF
    // concern, so validation does not reject it here.
    return false;
  }

  return records.some((record) =>
    record.family === 6 ? isPrivateOrReservedIpv6(record.address) : isPrivateOrReservedIpv4(record.address)
  );
}

export interface UrlValidationOptions {
  // Enables localhost/private-address targets for the batch evaluator's
  // local test server. Must stay false in production; see README.
  allowLocalTargets?: boolean;
}

// Validates syntax, protocol, and SSRF exposure for a company-supplied URL.
// Throws AppError(INVALID_COMPANY_URL) rather than returning a boolean so
// every call site gets a consistent, descriptive 400 response.
export async function validateCompanyUrl(rawUrl: string, options: UrlValidationOptions = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(ErrorCode.INVALID_COMPANY_URL, "The company URL is not a valid URL.", 400);
  }

  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new AppError(
      ErrorCode.INVALID_COMPANY_URL,
      "The company URL must use http or https.",
      400
    );
  }

  if (!parsed.hostname) {
    throw new AppError(ErrorCode.INVALID_COMPANY_URL, "The company URL is missing a hostname.", 400);
  }

  if (options.allowLocalTargets) {
    return parsed;
  }

  if (isBlockedHostnameLiteral(parsed.hostname) || (await resolvesToBlockedAddress(parsed.hostname))) {
    throw new AppError(
      ErrorCode.INVALID_COMPANY_URL,
      "The company URL points to a private, loopback, or otherwise disallowed network address.",
      400
    );
  }

  return parsed;
}
