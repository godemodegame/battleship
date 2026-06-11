import { writeFileSync } from 'node:fs'

const baseUrlValue = process.env.PUBLIC_DEMO_URL
if (!baseUrlValue) {
  console.error('Set PUBLIC_DEMO_URL to the staging or production HTTPS origin')
  process.exit(1)
}

const baseUrl = new URL(baseUrlValue)
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)
if (baseUrl.protocol !== 'https:' && !(isLocalhost && baseUrl.protocol === 'http:')) {
  console.error('PUBLIC_DEMO_URL must use HTTPS (HTTP is allowed only for localhost)')
  process.exit(1)
}
baseUrl.pathname = '/'
baseUrl.search = ''
baseUrl.hash = ''

const expectedDeploymentId =
  process.env.VITE_ACTIVE_DEPLOYMENT_ID || process.env.EXPECTED_DEPLOYMENT_ID || 'arb-sepolia-v1'
const requireActive = process.env.REQUIRE_ACTIVE_DEPLOYMENT === '1'
const probes = []
const problems = []

async function probe(path, expectedType, bodyPattern, forbiddenType) {
  const url = new URL(path, baseUrl)
  const startedAt = performance.now()
  const response = await fetch(url, { redirect: 'follow' })
  const body = await response.arrayBuffer()
  const durationMs = Math.round(performance.now() - startedAt)
  const contentType = response.headers.get('content-type') ?? ''
  probes.push({
    path,
    status: response.status,
    contentType,
    bytes: body.byteLength,
    durationMs,
  })

  if (!response.ok) problems.push(`${path} returned ${response.status}`)
  if (expectedType && !contentType.includes(expectedType)) {
    problems.push(`${path} returned ${contentType || 'no content type'}, expected ${expectedType}`)
  }
  if (forbiddenType && contentType.includes(forbiddenType)) {
    problems.push(`${path} returned forbidden content type ${contentType}`)
  }
  if (bodyPattern) {
    const text = new TextDecoder().decode(body)
    if (!bodyPattern.test(text)) problems.push(`${path} did not contain ${bodyPattern}`)
  }
  return { response, body }
}

const releaseProbe = await probe('/release.json', 'application/json')
let release = null
try {
  release = JSON.parse(new TextDecoder().decode(releaseProbe.body))
} catch {
  problems.push('/release.json is not valid JSON')
}

if (release) {
  if (release.schemaVersion !== 1) problems.push('release.json schemaVersion is not 1')
  if (release.application !== 'encrypted-battleship') {
    problems.push('release.json application is not encrypted-battleship')
  }
  if (release.deploymentId !== expectedDeploymentId) {
    problems.push(
      `release.json deploymentId ${release.deploymentId} does not equal ${expectedDeploymentId}`,
    )
  }
  if (!/^[0-9a-f]{40}$/.test(release.sourceCommit ?? '')) {
    problems.push('release.json sourceCommit is not a 40-character git SHA')
  }
  if (release.chainId !== 421614) problems.push('release.json chainId is not 421614')
  if (requireActive && release.deploymentStatus !== 'active') {
    problems.push(`release requires active deployment; URL reports ${release.deploymentStatus}`)
  }
  if (
    requireActive &&
    !/^0x[0-9a-fA-F]{40}$/.test(release.contractAddress ?? '')
  ) {
    problems.push('release requires a valid contractAddress')
  }
}

await probe('/', 'text/html', /<title>Encrypted Battleship<\/title>/)
await probe('/practice', 'text/html', /<title>Encrypted Battleship<\/title>/)
await probe(
  `/match/${encodeURIComponent(expectedDeploymentId)}/1`,
  'text/html',
  /<title>Encrypted Battleship<\/title>/,
)
await probe('/models/tactical-ocean-board.fbx', null, null, 'text/html')
await probe('/textures/tactical-ocean-board-texture.jpg', 'image/jpeg')
await probe('/models/vfx-hit-impact.glb', 'model/gltf-binary')

const evidence = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  baseUrl: baseUrl.origin,
  expectedDeploymentId,
  requireActive,
  release,
  probes,
}

if (process.env.RELEASE_EVIDENCE_PATH) {
  writeFileSync(
    process.env.RELEASE_EVIDENCE_PATH,
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
}

if (problems.length) {
  console.error('Public deployment verification failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log(
    `Public deployment verified at ${baseUrl.origin} ` +
      `(${expectedDeploymentId}, ${release?.sourceCommit ?? 'unknown commit'})`,
  )
  for (const result of probes) {
    console.log(
      `${result.path} ${result.status} ${result.bytes} bytes ${result.durationMs} ms`,
    )
  }
}
