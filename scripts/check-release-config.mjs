import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const problems = []
const allowedViteKeys = new Set([
  'VITE_PRIVY_APP_ID',
  'VITE_ARBITRUM_SEPOLIA_RPC_URL',
  'VITE_ACTIVE_DEPLOYMENT_ID',
  'VITE_BATTLESHIP_CONTRACT_ADDRESS',
])

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const runtimeSources = walk(join(root, 'src')).filter(
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path),
)
for (const path of runtimeSources) {
  const source = readFileSync(path, 'utf8')
  if (/\bconsole\.(log|info|debug|warn|error)\s*\(/.test(source)) {
    problems.push(`${path.slice(root.length + 1)} contains runtime console logging`)
  }
  if (
    /\b(?:posthog|mixpanel|gtag)\b/i.test(source) ||
    // "amplitude" is also a wave/shader math term, so require real SDK usage —
    // a method call or a single-line package import — not a bare mention.
    /\bamplitude\s*\.\s*\w+\s*\(/i.test(source) ||
    /\b(?:from|require\s*\()\s*['"][^'"\n]*amplitude[^'"\n]*['"]/i.test(source) ||
    /\b(?:analytics)\.(?:track|identify|page)\s*\(/i.test(source)
  ) {
    problems.push(`${path.slice(root.length + 1)} contains an analytics integration`)
  }
}

const envFiles = [
  join(root, '.env.example'),
  join(root, '.env.local'),
  join(root, '.vercel/.env.preview.local'),
].filter(existsSync)

for (const path of envFiles) {
  const source = readFileSync(path, 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '')
    if (key.startsWith('VITE_') && !allowedViteKeys.has(key)) {
      problems.push(`${path.slice(root.length + 1)} exposes unapproved browser key ${key}`)
    }
    if (key === 'VITE_E2E_MOCKS' && value === '1') {
      problems.push(`${path.slice(root.length + 1)} enables browser E2E mocks`)
    }
    if (key.startsWith('VITE_') && /^0x[0-9a-fA-F]{64}$/.test(value)) {
      problems.push(`${path.slice(root.length + 1)} appears to expose a private key`)
    }
  }
}

for (const path of [join(root, '.env.local'), join(root, '.vercel/.env.preview.local')]) {
  if (!existsSync(path)) continue
  try {
    execFileSync('git', ['check-ignore', '--quiet', path], { cwd: root })
  } catch {
    problems.push(`${path.slice(root.length + 1)} is not gitignored`)
  }
}

if (problems.length) {
  console.error('Release configuration check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('Release configuration check passed')
  console.log('Privy origin allowlisting remains a dashboard check for the target HTTPS origin')
}
