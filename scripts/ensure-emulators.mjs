// Used by the VS Code F5 launch: reuse running Firebase emulators, otherwise start them.
import { spawn } from "node:child_process";
import net from "node:net";

const READY = "All emulators ready";
const ports = [8080, 9099]; // Firestore, Auth

const isOpen = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});

const open = await Promise.all(ports.map(isOpen));
if (open.every(Boolean)) {
  console.log(`Firebase emulators already running. ${READY}`);
} else {
  const child = spawn("npm run emulators", { stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
}
