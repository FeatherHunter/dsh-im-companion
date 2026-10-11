import { createHostUpdate } from 'dsh-plugin-update'
import os from 'node:os'
import path from 'node:path'

const home = path.join(os.homedir(), '.dsh')
const t0 = Date.now()
let bridge
try {
  bridge = createHostUpdate(
    {
      ctx: {},
      logCtx: { fire: (l, e, f) => console.log('[LOG]', l, e, JSON.stringify(f)) },
      readerOverrides: { homeDir: home },
    },
    { pluginId: 'dsh-im-companion', prefix: 'imc', targetPackageName: 'dsh-im-companion' },
  )
} catch (e) {
  console.log('CREATE-THREW', e?.message, e?.stack?.split('\n').slice(0, 4).join(' | '))
  process.exit(0)
}
console.log('createHostUpdate ok in', Date.now() - t0, 'ms; phoneNames =', JSON.stringify(bridge.phoneNames))

async function run(label, fn, args) {
  const started = Date.now()
  const timer = setTimeout(() => console.log(`  >>> ${label} STILL PENDING after 20s`), 20000)
  try {
    const r = await fn(args)
    clearTimeout(timer)
    console.log(`--- ${label}: resolved in ${Date.now() - started} ms`)
    console.log('    ' + JSON.stringify(r).slice(0, 1200))
  } catch (e) {
    clearTimeout(timer)
    console.log(`--- ${label}: THREW in ${Date.now() - started} ms -> ${e?.name}: ${e?.message} code=${e?.code}`)
  }
}

await run('imc.updateStatus', bridge.handlers['imc.updateStatus'], {})
await run('imc.updateStatus+env+queue', bridge.handlers['imc.updateStatus'], { includeEnv: true, includeQueue: true, requestId: 'diag-1' })
await run('imc.updateCheck', bridge.handlers['imc.updateCheck'], {})
process.exit(0)
