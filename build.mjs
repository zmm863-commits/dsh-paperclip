#!/usr/bin/env node
/**
 * dsh-paperclip client bundle wrapper.
 *
 * DSH loads plugin client bundles through window.__ModuleLoader__.load({ id,
 * factory }): the browser half must REGISTER a factory, not just export one.
 * tsdown emits a bare ESM module (`import ... from "react"` +
 * `export { apply, inject }`), so this step rewrites lib/client.js into the
 * official loader-wrapped form:
 *
 *   window.__ModuleLoader__.load({ id: "dsh-paperclip", factory: (require) => {
 *     var module = { exports: {} }; var exports = module.exports;
 *     const { createElement, useCallback, useEffect, useRef, useState } = require("react");
 *     ... bundle body (export statement stripped) ...
 *     module.exports = { apply, inject };
 *     return module.exports;
 *   } });
 *
 * React is a platform seed word inside the module system, so the top-level
 * ESM `import ... from "react"` is rewritten to a destructured require. The
 * trailing `export { apply, inject }` is replaced by a CJS assignment.
 *
 * Run after `tsdown` (see package.json "build": "tsdown && node build.mjs").
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('./package.json', import.meta.url)))
const clientPath = join(root, 'lib', 'client.js')
const PLUGIN_ID = 'dsh-paperclip'

let src = readFileSync(clientPath, 'utf8')

// The bundle must end with the single export line tsdown emits.
const exportLine = 'export { apply, inject };'
if (!src.includes(exportLine)) {
  console.error('[dsh-paperclip] build.mjs: expected "' + exportLine + '" in lib/client.js')
  process.exit(1)
}
if (src.includes('window.__ModuleLoader__.load')) {
  console.log('[dsh-paperclip] client.js already wrapped — skipping')
  process.exit(0)
}

// Rewrite the top-level ESM react import into a CJS require (react is a seed word).
const importRe = /^import\s*\{([^}]*)\}\s*from\s*["']react["'];\s*\n?/m
const match = src.match(importRe)
if (!match) {
  console.error('[dsh-paperclip] build.mjs: expected a react ESM import at the top of lib/client.js')
  process.exit(1)
}
const names = match[1].split(',').map((s) => s.trim()).filter(Boolean).join(', ')
src = src.replace(importRe, 'const { ' + names + ' } = require("react");\n')

const body = src.replace(exportLine, 'module.exports = { apply, inject };')

const wrapped =
  'window.__ModuleLoader__.load({ id: "' + PLUGIN_ID + '", factory: (require) => {\n' +
  '  var module = { exports: {} }; var exports = module.exports;\n' +
  body +
  '\n  return module.exports;\n' +
  '} });\n'

writeFileSync(clientPath, wrapped)
console.log('[dsh-paperclip] client.js wrapped for __ModuleLoader__.load ✓')
