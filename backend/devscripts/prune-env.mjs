import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_PATH = path.resolve('.env');
const EXAMPLE_PATH = path.resolve('.env.example');
const KEY_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function readKeys(filePath) {
  const keys = [];
  const seen = new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(KEY_PATTERN);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      keys.push(match[1]);
    }
  }
  return keys;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`No .env found at ${ENV_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(EXAMPLE_PATH)) {
    console.error(`No .env.example found at ${EXAMPLE_PATH}`);
    process.exit(1);
  }

  const allowedKeys = readKeys(EXAMPLE_PATH);
  const allowedSet = new Set(allowedKeys);
  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const hadTrailingNewline = original.endsWith('\n');
  const lines = original.split(/\r?\n/);

  const removedKeys = [];
  const keptLines = [];
  const presentKeys = new Set();
  for (const line of lines) {
    const match = line.match(KEY_PATTERN);
    if (match && !allowedSet.has(match[1])) {
      removedKeys.push(match[1]);
      continue;
    }
    if (match) presentKeys.add(match[1]);
    keptLines.push(line);
  }

  const addedKeys = allowedKeys.filter((key) => !presentKeys.has(key));

  if (removedKeys.length === 0 && addedKeys.length === 0) {
    console.log('.env is already in sync with .env.example, nothing to do.');
    return;
  }

  let output = keptLines.join('\n');
  if (hadTrailingNewline && !output.endsWith('\n')) output += '\n';

  if (addedKeys.length > 0) {
    if (output.length > 0 && !output.endsWith('\n')) output += '\n';
    output += addedKeys.map((key) => `${key}=`).join('\n') + '\n';
  }

  fs.writeFileSync(ENV_PATH, output);

  if (removedKeys.length > 0) {
    console.log(`Removed ${removedKeys.length} key(s) not present in .env.example:`);
    for (const key of removedKeys) console.log(`  - ${key}`);
  }
  if (addedKeys.length > 0) {
    console.log(`Added ${addedKeys.length} key(s) missing from .env:`);
    for (const key of addedKeys) console.log(`  + ${key}`);
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isDirect) {
  console.error('prune-env.mjs can only be executed directly (node devscripts/prune-env.mjs).');
  process.exit(1);
}

main();
