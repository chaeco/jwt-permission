#!/usr/bin/env node

/**
 * Copies jwt-permission AI skill files into the consumer's project.
 *
 * Usage:
 *   npx jwt-permission-init-skills          # target: cwd
 *   npx jwt-permission-init-skills ../my-app # target: custom path
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'jwt-permission'
const PLATFORMS = ['.claude', '.codex']

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const targetRoot = resolve(process.argv[2] ?? process.cwd())

for (const platform of PLATFORMS) {
  const srcFile = join(pkgRoot, platform, 'skills', SKILL_NAME, 'SKILL.md')
  const destDir = join(targetRoot, platform, 'skills', SKILL_NAME)

  if (!existsSync(srcFile)) {
    console.warn(`⚠  Source not found: ${srcFile} — skipping ${platform}`)
    continue
  }

  if (existsSync(destDir)) {
    console.log(`⏭  ${platform}/skills/${SKILL_NAME} already exists — skipping`)
    continue
  }

  mkdirSync(destDir, { recursive: true })
  cpSync(srcFile, join(destDir, 'SKILL.md'))

  console.log(`✓  Copied SKILL.md → ${platform}/skills/${SKILL_NAME}/`)
}

console.log('Done. AI tools in this project can now use the jwt-permission skill.')
