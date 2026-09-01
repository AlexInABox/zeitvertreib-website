#!/usr/bin/env node
/**
 * Generates `projects/ui/src/lib/registry.generated.ts` from the UI library
 * sources. Runs automatically before every build/serve (npm pre-hooks).
 *
 * For each `lib/**\/*.component.ts` it extracts:
 *   - the `selector` and exported class name
 *   - the JSDoc description directly above `@Component`
 *   - signal inputs / model inputs (name, type, default, required)
 *   - outputs
 * and references a co-located `<name>.demo.ts` if one exists. Demo files must
 * export `demos: UiDemoEntry[]` (see `lib/registry.ts`).
 *
 * Conventions required for reliable extraction:
 *   - one input/output declaration per line
 *   - selectors are string literals directly in the decorator
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const libDir = join(frontendDir, 'projects', 'ui', 'src', 'lib');
const outFile = join(libDir, 'registry.generated.ts');

function listComponentFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listComponentFiles(full));
    } else if (entry.name.endsWith('.component.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Converts a JS primitive to a Prettier-stable single-quoted TS literal. */
function tsLiteral(value) {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  return String(value);
}

/** Normalizes a raw default-value expression to a JS primitive or null. */
function parseDefault(raw) {
  const value = raw.trim();
  if (value === '') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value === 'undefined' || value === 'null') {
    return null;
  }
  const quoted = value.match(/^['"`]([\s\S]*)['"`]$/);
  if (quoted) {
    return quoted[1];
  }
  return value;
}

/** Strips quotes from type literals for prettier docs display. */
function normalizeType(raw) {
  return raw ? raw.replace(/['"`]/g, '') : null;
}

function parseComponent(source, relPath) {
  const selectorMatch = source.match(/selector:\s*['"`]([^'"`]+)['"`]/);
  const classMatch = source.match(/export\s+class\s+(\w+)/);
  if (!selectorMatch || !classMatch) {
    console.warn(`[ui-registry] skipping ${relPath}: selector or class name not found`);
    return null;
  }

  let description = '';
  const docMatch = source.match(/\/\*\*([\s\S]*?)\*\/\s*\n?\s*@Component/);
  if (docMatch) {
    description = docMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  const inputs = [];

  const inputRe = /readonly\s+(\w+)\s*=\s*input(\.required)?(?:<([^>]*)>)?\s*\(([^)]*)\)/g;
  let match;
  while ((match = inputRe.exec(source)) !== null) {
    inputs.push({
      name: match[1],
      type: normalizeType(match[3]),
      default: parseDefault(match[4].split(',')[0]),
      required: Boolean(match[2]),
    });
  }

  const modelRe = /readonly\s+(\w+)\s*=\s*model(?:<([^>]*)>)?\s*\(([^)]*)\)/g;
  while ((match = modelRe.exec(source)) !== null) {
    inputs.push({
      name: match[1],
      type: normalizeType(match[2]),
      default: parseDefault(match[3].split(',')[0]),
      required: false,
      twoWay: true,
    });
  }

  const outputs = [];
  const outputRe = /readonly\s+(\w+)\s*=\s*output(?:<[^>]*>)?\s*\(/g;
  while ((match = outputRe.exec(source)) !== null) {
    outputs.push(match[1]);
  }

  const base = relPath.replace(/\.component\.ts$/, '');
  const baseName = base.split('/').pop();
  const hasDemo = existsSync(join(libDir, `${base}.demo.ts`));

  return {
    name: classMatch[1],
    selector: selectorMatch[1],
    description,
    inputs,
    outputs,
    base,
    baseName,
    hasDemo,
  };
}

function toCamelCase(name) {
  return name
    .split('-')
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('');
}

/** Emits a `key: [...]` property; keeps it on one line if it fits printWidth (Prettier-stable). */
function emitArrayProperty(lines, indent, key, items) {
  const flat = `${indent}${key}: [${items.join(', ')}],`;
  if (flat.length <= 120) {
    lines.push(flat);
    return;
  }
  lines.push(`${indent}${key}: [`);
  for (const item of items) {
    lines.push(`${indent}  ${item},`);
  }
  lines.push(`${indent}],`);
}

function generate() {
  const components = [];
  for (const file of listComponentFiles(libDir)) {
    const relPath = relative(libDir, file).split(sep).join('/');
    if (relPath === 'registry.generated.ts') {
      continue;
    }
    const meta = parseComponent(readFileSync(file, 'utf8'), relPath);
    if (meta) {
      components.push(meta);
    }
  }
  components.sort((a, b) => a.selector.localeCompare(b.selector));

  const lines = [];
  lines.push('// AUTO-GENERATED by tools/generate-ui-registry.mjs — do not edit manually.');
  lines.push('// Regenerates automatically before every build/serve (see package.json pre-hooks).');
  lines.push('');
  lines.push("import type { UiComponentMeta } from './registry';");
  lines.push('');
  for (const meta of components) {
    lines.push(`import { ${meta.name} } from './${meta.base}.component';`);
    if (meta.hasDemo) {
      lines.push(`import * as ${toCamelCase(meta.baseName)}Demo from './${meta.base}.demo';`);
    }
  }
  lines.push('');
  lines.push('export const UI_REGISTRY: UiComponentMeta[] = [');
  for (const meta of components) {
    lines.push('  {');
    lines.push(`    name: ${tsLiteral(meta.name)},`);
    lines.push(`    selector: ${tsLiteral(meta.selector)},`);
    lines.push(`    description: ${tsLiteral(meta.description)},`);
    const inputItems = meta.inputs.map((input) => {
      const parts = [];
      parts.push(`name: ${tsLiteral(input.name)}`);
      parts.push(`type: ${input.type ? tsLiteral(input.type) : 'null'}`);
      parts.push(`default: ${tsLiteral(input.default)}`);
      parts.push(`required: ${input.required}`);
      if (input.twoWay) {
        parts.push('twoWay: true');
      }
      return `{ ${parts.join(', ')} }`;
    });
    emitArrayProperty(lines, '    ', 'inputs', inputItems);
    emitArrayProperty(
      lines,
      '    ',
      'outputs',
      meta.outputs.map((output) => tsLiteral(output)),
    );
    lines.push(`    component: ${meta.name},`);
    lines.push(`    demos: ${meta.hasDemo ? `${toCamelCase(meta.baseName)}Demo.demos` : '[]'},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, lines.join('\n'));
  console.log(`[ui-registry] wrote ${components.length} component(s) to ${relative(frontendDir, outFile)}`);
}

generate();
