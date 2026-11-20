import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

function readClaimUrl() {
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf8").match(/^CLAIM_URL=(.+)$/m);
  return match?.[1]?.replace(/^"|"$/g, "") ?? null;
}

function appendPoolParams(url) {
  const trimmed = url.replace(/^"|"$/g, "").trim();
  if (!trimmed) return trimmed;
  const hasLimit = /connection_limit=/.test(trimmed);
  if (hasLimit) return trimmed;
  const sep = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${sep}connection_limit=3&pool_timeout=30&connect_timeout=30`;
}

function updateDatabaseUrl(connectionString, claimUrl) {
  const databaseUrl = appendPoolParams(connectionString);
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const kept = lines.filter(
    (line) =>
      line.trim() &&
      !line.startsWith("DATABASE_URL=") &&
      !line.startsWith("CLAIM_URL="),
  );

  const header = [
    "# Dev DB — claim before expiry or use Docker: npm run db:up",
    `DATABASE_URL="${databaseUrl}"`,
    claimUrl ? `CLAIM_URL="${claimUrl}"` : null,
    "",
  ].filter(Boolean);

  writeFileSync(envPath, [...header, ...kept].join("\n").trimEnd() + "\n", "utf8");
}

function runPrismaMigrate() {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env },
  });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const unreachable =
    /P1001|Can't reach database server|Can't reach database/i.test(output);

  return { ok: result.status === 0, unreachable, output };
}

function provisionTempDatabase() {
  console.log("\n[db] Dev database unreachable — creating a temporary Prisma Postgres DB…\n");

  const result = spawnSync(
    "npx",
    ["create-db@latest", "--region", "us-east-1", "--env", ".env"],
    { cwd: root, shell: true, encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    console.error(
      "\n[db] Could not create a temp database. Use Docker: npm run db:up (see .env.example), or retry when online.\n",
    );
    process.exit(1);
  }

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const urlMatch = combined.match(/postgres:\/\/[^\s|]+/);
  const claimMatch = combined.match(
    /https:\/\/create-db\.prisma\.io\/claim[^\s|)]+/,
  );

  if (urlMatch) {
    updateDatabaseUrl(urlMatch[0], claimMatch?.[0] ?? null);
  }
}

const first = runPrismaMigrate();
if (first.ok) {
  const claim = readClaimUrl();
  if (claim) {
    console.log("[db] Connected. If this is a new temp DB, claim it:", claim);
  }
  process.exit(0);
}

if (!first.unreachable) {
  console.error(first.output);
  process.exit(1);
}

provisionTempDatabase();
const second = runPrismaMigrate();
if (!second.ok) {
  console.error(second.output);
  process.exit(1);
}

const claim = readClaimUrl();
console.log("[db] Migrations applied.");
if (claim) {
  console.log("[db] IMPORTANT: Open CLAIM_URL in your browser so the DB is not deleted in ~24h:");
  console.log(`      ${claim}`);
}
console.log("[db] New temp DB = empty app data — re-open DrobeBook admin and import products.\n");