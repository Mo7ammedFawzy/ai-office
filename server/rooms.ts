import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Rooms are the git repos directly under the projects root; dot folders (.worktrees, .scratch) are not.
export function discover(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(root, d.name, '.git')))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
}
