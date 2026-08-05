import { spawnSync } from 'node:child_process'

function run(command, args) {
  const result = spawnSync(command, args, {
    env: { ...process.env, QUTWIKI_XLSX_FORCE: '1' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['docs/.vitepress/scripts/gen-contributors.mjs'])
run('vitepress', ['build', 'docs'])
