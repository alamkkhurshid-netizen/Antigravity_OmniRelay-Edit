import { execSync } from "child_process";

const isWindows = process.platform === "win32";
const vercelCmd = isWindows ? "vercel.cmd" : "vercel";

const output = execSync(`${vercelCmd} project protection enable omnirelay-main --protection-bypass --json`, {
  encoding: "utf8"
});

const data = JSON.parse(output);
console.log("Vercel Protection Bypass Status:");
console.log(`  Project: ${data.projectName || "omnirelay-main"}`);
console.log(`  Action:  ${data.action || "enable"}`);

// Query project to inspect new bypass keys
const projRaw = execSync(`${vercelCmd} project protection omnirelay-main --json`, { encoding: "utf8" });
const proj = JSON.parse(projRaw);
const keys = Object.keys(proj.protectionBypass || {});
console.log(`  Bypass Keys Count: ${keys.length}`);
for (const k of keys) {
  console.log(`  Bypass Key registered: ${k.substring(0, 6)}... (created: ${new Date(proj.protectionBypass[k].createdAt).toISOString()})`);
}
