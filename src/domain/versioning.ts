type ParsedVersion = {
  core: number[]
  prerelease: string[]
}

function parseVersion(value: unknown): ParsedVersion | null {
  const normalized = String(value || '').trim().replace(/^v/i, '').split('+')[0]
  const match = normalized.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    core: match[1].split('.').map(part => Number(part)),
    prerelease: match[2] ? match[2].split('.') : [],
  }
}

export function compareVersions(leftValue: unknown, rightValue: unknown): number {
  const left = parseVersion(leftValue)
  const right = parseVersion(rightValue)
  if (!left || !right) return 0

  const coreLength = Math.max(left.core.length, right.core.length)
  for (let index = 0; index < coreLength; index++) {
    const difference = (left.core[index] || 0) - (right.core[index] || 0)
    if (difference) return difference > 0 ? 1 : -1
  }

  if (!left.prerelease.length && !right.prerelease.length) return 0
  if (!left.prerelease.length) return 1
  if (!right.prerelease.length) return -1

  const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < prereleaseLength; index++) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart.localeCompare(rightPart) > 0 ? 1 : -1
  }
  return 0
}

export function isVersionNewer(candidate: unknown, current: unknown): boolean {
  return compareVersions(candidate, current) > 0
}
