import { execSync } from 'child_process'
import { writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, relative, extname, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..', '..', '..')
const docsDir = resolve(repoRoot, 'docs')
const outPath = resolve(__dirname, '..', 'contributors.json')
const mappingPath = resolve(__dirname, '..', 'contributors-mapping.json')

function walkMdFiles(dir, base) {
  const results = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = resolve(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (entry === '.vitepress' || entry === 'node_modules' || entry.startsWith('.')) continue
      results.push(...walkMdFiles(full, base))
    } else if (extname(entry) === '.md') {
      results.push(relative(base, full).replace(/\\/g, '/'))
    }
  }
  return results
}

function extractGitHubUsername(email) {
  const match = email.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/)
  return match ? match[2] : null
}

function getContributors(relPath) {
  try {
    const output = execSync(
      `git log --follow --format="%an|%ae" -- "${relPath}"`,
      { encoding: 'utf-8', cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 }
    )
    const lines = output.trim().split('\n').filter(Boolean)
    const map = new Map()
    for (const line of lines) {
      const [name, email] = line.split('|')
      if (!name || !email) continue
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, { name, emails: new Map(), total: 0, firstEmail: email })
      }
      const entry = map.get(key)
      entry.emails.set(email.toLowerCase(), (entry.emails.get(email.toLowerCase()) || 0) + 1)
      entry.total++
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map(c => {
        const emails = [...c.emails.keys()]
        let github = resolveGitHub(emails, c.name)
        if (!github) {
          const lowerEmails = emails.map(e => e.toLowerCase())
          for (const [key, gh] of Object.entries(mapping)) {
            if (lowerEmails.includes(key.toLowerCase()) || c.name.toLowerCase() === key.toLowerCase()) {
              github = gh
              break
            }
          }
        }
        return {
          name: c.name,
          email: c.firstEmail,
          github,
          commits: c.total,
        }
      })
  } catch {
    return []
  }
}

function loadMapping() {
  try {
    return JSON.parse(readFileSync(mappingPath, 'utf-8'))
  } catch {
    return {}
  }
}

let mapping = {}

function resolveGitHub(emails, name) {
  for (const email of emails) {
    const username = extractGitHubUsername(email)
    if (username) return username
  }
  return null
}

function main() {
  if (!existsSync(resolve(repoRoot, '.git'))) {
    writeFileSync(outPath, '{}')
    console.log('No git repository found, generated empty contributors data')
    return
  }

  const docsRelToRoot = relative(repoRoot, docsDir).replace(/\\/g, '/')
  mapping = loadMapping()
  const files = walkMdFiles(docsDir, docsDir)
  const result = {}

  for (const file of files) {
    const gitPath = `${docsRelToRoot}/${file}`
    const contributors = getContributors(gitPath)
    if (contributors.length > 0) {
      result[file] = contributors
    }
  }

  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`Generated contributors data for ${Object.keys(result).length} files`)
}

main()
