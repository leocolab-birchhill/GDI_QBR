/**
 * Stop stale Next dev servers, clear .next, start ONE dev server on port 3000.
 * Usage: npm run dev:reset
 */
import { execSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import net from "node:net";

const DEV_PORT = 3000;
const DEV_PORTS = [3000, 3001, 3002];
const LOCK = ".dev-reset.lock";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(true));
    s.once("listening", () => {
      s.close(() => resolve(false));
    });
    s.listen(port, "0.0.0.0");
  });
}

/** Run a shell command; never throws. */
function run(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", shell: true });
  } catch {
    // ignore
  }
}

/** Kill node processes whose command line includes `next dev`. */
function killNextDevProcesses() {
  if (process.platform === "win32") {
    run(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'next dev\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
    );
    return;
  }
  run('pkill -f "next dev" || true');
}

/** Kill PIDs listening on a TCP port (Windows — PowerShell + netstat fallback). */
function killWindowsPort(port) {
  run(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
  );

  try {
    const out = execSync("netstat -ano -p TCP", { encoding: "utf8", shell: true });
    const portPattern = new RegExp(`[:\\]]${port}\\s`);
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING") || !portPattern.test(line)) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      run(`taskkill //PID ${pid} //T //F`);
    }
  } catch {
    // nothing on this port
  }
}

function killAllDevPorts() {
  killNextDevProcesses();
  if (process.platform === "win32") {
    for (const port of DEV_PORTS) killWindowsPort(port);
    return;
  }
  for (const port of DEV_PORTS) {
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: "ignore",
        shell: true,
      });
    } catch {
      // ignore
    }
  }
}

async function waitForPortFree(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await portInUse(port))) return true;
    killAllDevPorts();
    await sleep(1500);
  }
  return false;
}

async function removeNextDir() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(".next", { recursive: true, force: true });
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Could not delete .next — close other dev servers and retry.");
}

/** Remove lock file left by a crashed previous reset. */
function clearStaleLock() {
  if (!existsSync(LOCK)) return;
  try {
    const pid = Number(readFileSync(LOCK, "utf8").trim());
    if (!pid) {
      unlinkSync(LOCK);
      return;
    }
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: "utf8",
        shell: true,
      });
      if (out.includes("No tasks") || !out.trim()) unlinkSync(LOCK);
    } else {
      try {
        process.kill(pid, 0);
      } catch {
        unlinkSync(LOCK);
      }
    }
  } catch {
    try {
      unlinkSync(LOCK);
    } catch {
      // ignore
    }
  }
}

async function main() {
  clearStaleLock();

  if (existsSync(LOCK)) {
    console.error("[dev:reset] Another reset is already running. Wait for it to finish.");
    process.exit(1);
  }
  writeFileSync(LOCK, String(process.pid));

  try {
    console.log("[dev:reset] Stopping next dev + anything on ports 3000–3002…");
    killAllDevPorts();
    await sleep(2500);

    const free = await waitForPortFree(DEV_PORT);
    if (!free) {
      console.error(`\n[dev:reset] Port ${DEV_PORT} is still in use after cleanup.`);
      console.error("Close every terminal running `npm run dev` / `dev:reset`, then try again.\n");
      process.exit(1);
    }

    console.log("[dev:reset] Clearing .next…");
    await removeNextDir();

    // One last kill pass — a poller/instrumentation child can linger briefly.
    killAllDevPorts();
    await sleep(1000);
    if (await portInUse(DEV_PORT)) {
      console.error(`\n[dev:reset] Port ${DEV_PORT} became busy again. Aborting.\n`);
      process.exit(1);
    }

    console.log(`[dev:reset] Starting dev server on http://localhost:${DEV_PORT} …\n`);
    const result = spawnSync("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    process.exit(result.status ?? 1);
  } finally {
    try {
      unlinkSync(LOCK);
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error("[dev:reset]", err.message);
  process.exit(1);
});
