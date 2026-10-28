#!/usr/bin/env node
/**
 * Archive mode bundle: after `npm run build`, copy ../evidence into
 * ../static/evidence and write ../static/catalog.json (a snapshot of
 * GET /api/catalog produced by the Python registry). The resulting static/
 * folder runs on any static host with no server; live runs are disabled.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const staticDir = resolve(root, 'static')
const evidence = resolve(root, 'evidence')

if (!existsSync(resolve(staticDir, 'index.html'))) {
  console.error('static/index.html missing: run `npm run build` first')
  process.exit(1)
}
const catalog = execFileSync('python3', ['-c', 'import json; from bench import registry; print(json.dumps(registry.catalog()))'], { cwd: root, encoding: 'utf8' })
writeFileSync(resolve(staticDir, 'catalog.json'), catalog)
if (existsSync(evidence)) {
  mkdirSync(resolve(staticDir, 'evidence'), { recursive: true })
  cpSync(evidence, resolve(staticDir, 'evidence'), { recursive: true })
  console.log('copied evidence/ into static/evidence/')
} else {
  console.warn('no evidence/ folder; archive will have an empty matrix')
}
console.log('wrote static/catalog.json')
