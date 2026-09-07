import fs from "node:fs";
import path from "node:path";

/**
 * Script-side env loading. tsx does not read .env.local, so scripts load it
 * explicitly (never printing values). Precedence: process env > .env.local > .env
 */
let loaded = false;

export function loadEnv(root = process.cwd()) {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key] || process.env[key]?.trim() === "") process.env[key] = value;
    }
  }
}

export function env(name: string, fallback?: string): string {
  loadEnv();
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env ${name}. Copy .env.example to .env.local and fill it in.`);
}

export function optionalEnv(name: string): string | undefined {
  loadEnv();
  const v = process.env[name]?.trim();
  return v || undefined;
}

export const HERMES_PROJECT_REF = "cwiaqczpifnxxcucqwvr";
export const LEGACY_PROJECT_REF = "vnxypnpepwxurhbdtswn";

export function log(message: string, extra?: unknown) {
  const ts = new Date().toISOString().slice(11, 19);
  if (extra !== undefined) console.log(`[${ts}] ${message}`, extra);
  else console.log(`[${ts}] ${message}`);
}
