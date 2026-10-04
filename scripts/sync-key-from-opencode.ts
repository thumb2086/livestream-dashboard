/**
 * Copies a credential from opencode's auth store into .env.local without ever
 * printing it or reconstructing it by hand.
 *
 * Typing a key from a truncated preview produces a valid-looking but wrong
 * credential, which fails as a confusing 401 far from the real cause.
 *
 * Usage: npx tsx scripts/sync-key-from-opencode.ts <provider> <ENV_NAME>
 */
import fs from "node:fs";

const provider = process.argv[2] ?? "groq";
const envName = process.argv[3] ?? "GROQ_API_KEY";
const authPath = `${process.env.USERPROFILE}/.local/share/opencode/auth.json`;
const envPath = ".env.local";

if (!fs.existsSync(authPath)) {
  console.error(`auth store not found: ${authPath}`);
  process.exit(1);
}

const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
const secret = auth[provider]?.key;
if (!secret) {
  console.error(`provider "${provider}" has no key in the auth store`);
  process.exit(1);
}

const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const line = new RegExp(`^${envName}=.*$`, "m");
const next = line.test(existing)
  ? existing.replace(line, `${envName}=${secret}`)
  : `${existing.trimEnd()}\n${envName}=${secret}\n`;

// Never echo the value: report shape only.
fs.writeFileSync(envPath, next, "utf8");
const prefix = secret.slice(0, 8);
console.log(`wrote ${envName} from provider "${provider}" (${secret.length} chars, starts ${prefix}…)`);
