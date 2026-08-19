#!/usr/bin/env node
/**
 * Verify the __ModuleLoader__-wrapped client bundle loads exactly like DSH's
 * client-modules expects:
 *  1. Executing lib/client.js registers a factory via window.__ModuleLoader__.load
 *  2. The factory materializes { apply, inject } — matching DSH's arrive() check
 *     (factories.has(id)) and the shell's create({name}) → apply contract.
 *  3. apply(ctx) tolerates a stubbed DOM environment without throwing
 *     (the web shell fails the whole boot when a plugin apply throws).
 *
 * React is a platform seed word inside DSH's module system; here we stub it
 * with the real hooks so the bundle body runs.
 */
import { readFileSync } from 'node:fs'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { JSDOM } from 'jsdom'

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const results = []
const check = (n, c) => { results.push([c ? 'PASS' : 'FAIL', n]) }

// ── Simulate the DSH client-modules loader ──
const factories = new Map()
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://dsh.example/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const w = dom.window
w.__ModuleLoader__ = {
  load: (handoff) => {
    if (factories.has(handoff.id)) throw new Error('duplicate factory: ' + handoff.id)
    factories.set(handoff.id, handoff.factory)
  },
}
// Execute the wrapped bundle in the window context.
w.eval(bundle)

check('bundle registered a factory via __ModuleLoader__.load', factories.has('dsh-paperclip'))

// ── Materialize: call the factory with the react seed + fail on anything else ──
const requireStub = (spec) => {
  if (spec === 'react') return { createElement, useCallback, useEffect, useRef, useState }
  throw new Error('unexpected require: ' + spec + ' (only react is a valid dependency)')
}
let plugin
try {
  plugin = factories.get('dsh-paperclip')(requireStub)
  check('factory materializes a plugin object', plugin && typeof plugin === 'object')
  check('plugin exposes apply', typeof plugin.apply === 'function')
  check('plugin declares inject', Array.isArray(plugin.inject) && plugin.inject.includes('slots'))
} catch (e) {
  check('factory materialization', false)
  console.log('  materialize error:', e.message)
}

// ── apply(ctx) must not throw in a bare environment ──
if (plugin) {
  try {
    const ctxStub = {
      locale: {
        register: () => {},
        bind: () => (k) => k,
      },
      slots: {
        inject: () => {},
        register: () => {},
      },
      effect: () => () => {},
    }
    plugin.apply(ctxStub)
    check('apply(ctx) does not throw (bare env)', true)
  } catch (e) {
    check('apply(ctx) does not throw (bare env)', false)
    console.log('  apply error:', e.message)
  }
}

// ── Round-trip id matches the boot row id used by the host patch ──
check('factory id matches plugin name', [...factories.keys()][0] === 'dsh-paperclip')

const fails = results.filter(([s]) => s === 'FAIL').length
results.forEach(([s, n]) => console.log(s, n))
console.log(fails === 0 ? '\nALL PASS ✅ — bundle loads exactly as DSH expects' : `\n${fails} FAILED ❌`)
process.exit(fails === 0 ? 0 : 1)
