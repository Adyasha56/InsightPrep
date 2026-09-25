import { ChildProcess, spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import net from "net";
import { tmpdir } from "os";
import path from "path";

export interface TestMongod {
  stop: () => Promise<void>;
}

// Spawns a disposable local mongod instance for integration tests, rather
// than depending on a shared/external database or a network-downloaded
// in-memory server. Requires mongod to be on PATH.
export async function startTestMongod(port: number): Promise<TestMongod> {
  const dbPath = mkdtempSync(path.join(tmpdir(), "insightprep-mongo-"));

  const child: ChildProcess = spawn(
    "mongod",
    ["--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: "ignore" }
  );

  await waitForPort(port, 20000);

  return {
    stop: async () => {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
      rmSync(dbPath, { recursive: true, force: true });
    },
  };
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`mongod did not start listening on port ${port} in time.`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}
