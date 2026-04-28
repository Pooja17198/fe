const net = require("net");
const { spawn } = require("child_process");

const DEFAULT_PORT = Number.parseInt(process.env.PORT || "8000", 10);
const MAX_PORT_ATTEMPTS = 20;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && (error.code === "EADDRINUSE" || error.code === "EACCES")) {
        resolve(false);
        return;
      }
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }

  throw new Error(
    `Unable to find an open port in the range ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1}.`
  );
}

async function main() {
  const requestedPort = Number.isFinite(DEFAULT_PORT) ? DEFAULT_PORT : 8000;
  const selectedPort = await findOpenPort(requestedPort);

  if (selectedPort !== requestedPort) {
    console.log(
      `[start] Port ${requestedPort} is already in use. Starting Oracle JET on port ${selectedPort} instead.`
    );
  } else {
    console.log(`[start] Starting Oracle JET on port ${selectedPort}.`);
  }

  const command = process.platform === "win32" ? "ojet.cmd" : "ojet";
  const child = spawn(command, ["serve", "web", "--server-port", String(selectedPort)], {
    env: {
      ...process.env,
      OJET_DEV_SERVER_PORT: String(selectedPort),
      PORT: String(selectedPort),
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[start] Failed to launch Oracle JET dev server: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(`[start] ${error.message}`);
  process.exit(1);
});
