// Deterministic IPv4/IPv6 classification used to block SSRF targets
// (loopback, private, link-local, and other non-public ranges). Kept
// dependency-free since this is a small, well-bounded amount of logic.

interface Ipv4CidrRange {
  base: number;
  maskBits: number;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function parseIpv4Cidr(cidr: string): Ipv4CidrRange {
  const [ip, bits] = cidr.split("/");
  return { base: ipv4ToInt(ip), maskBits: Number(bits) };
}

// Loopback, private (RFC1918), link-local, CGNAT, documentation/test,
// multicast, and reserved ranges — everything that should never be reached
// by a server-side fetch initiated from an untrusted user-supplied URL.
const PRIVATE_IPV4_RANGES: Ipv4CidrRange[] = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map(parseIpv4Cidr);

function isIpv4InRange(ip: number, range: Ipv4CidrRange): boolean {
  const shift = 32 - range.maskBits;
  const mask = shift >= 32 ? 0 : (0xffffffff << shift) >>> 0;
  return (ip & mask) === (range.base & mask);
}

export function isPrivateOrReservedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some((range) => isIpv4InRange(value, range));
}

const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

function expandIpv6Groups(ip: string): number[] | null {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];

  if (!ip.includes("::") && headParts.length !== 8) {
    return null;
  }

  const missing = 8 - headParts.length - tailParts.length;
  if (ip.includes("::") && missing < 0) {
    return null;
  }

  const groups = ip.includes("::")
    ? [...headParts, ...Array(missing).fill("0"), ...tailParts]
    : headParts;

  return groups.map((part) => parseInt(part, 16));
}

export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  const mapped = normalized.match(IPV4_MAPPED_IPV6);
  if (mapped) {
    return isPrivateOrReservedIpv4(mapped[1]);
  }

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  const groups = expandIpv6Groups(normalized);
  if (!groups || groups.length !== 8) {
    // Unable to parse confidently — fail closed rather than risk an SSRF bypass.
    return true;
  }

  const first = groups[0];
  const isUniqueLocal = (first & 0xfe00) === 0xfc00; // fc00::/7
  const isLinkLocal = (first & 0xffc0) === 0xfe80; // fe80::/10
  const isMulticast = (first & 0xff00) === 0xff00; // ff00::/8

  return isUniqueLocal || isLinkLocal || isMulticast;
}
