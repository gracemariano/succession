#!/usr/bin/env node
/**
 * Push site files to https://github.com/gracemariano/succession
 * Usage: GITHUB_TOKEN=ghp_xxx node deploy-to-github.mjs
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const OWNER = "gracemariano";
const REPO = "succession";
const BRANCH = "main";
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("Set GITHUB_TOKEN or GH_TOKEN (repo scope) then re-run.");
  process.exit(1);
}

const IGNORE = new Set([".git", ".tools", "node_modules", "deploy-to-github.mjs"]);

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body.message || text}`);
  return body;
}

async function getFileSha(path) {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`);
    return data.sha;
  } catch {
    return null;
  }
}

async function uploadFile(path) {
  const content = readFileSync(join(ROOT, path)).toString("base64");
  const sha = await getFileSha(path);
  const body = {
    message: sha ? `Update ${path}` : `Add ${path}`,
    content,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(`✓ ${path}`);
}

const files = collectFiles(ROOT).sort();
console.log(`Uploading ${files.length} file(s) to ${OWNER}/${REPO}…`);
for (const f of files) await uploadFile(f);
console.log(`\nDone. Enable Pages: https://github.com/${OWNER}/${REPO}/settings/pages`);
console.log(`Site: https://${OWNER}.github.io/${REPO}/`);
