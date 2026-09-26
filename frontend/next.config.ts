import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 regenerates AGENTS.md/CLAUDE.md on every `next dev` otherwise —
  // those are editor/agent tooling files, not project deliverables.
  agentRules: false,
};

export default nextConfig;
