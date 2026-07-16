import { promises as fs } from 'node:fs'
import path from 'node:path'
import { newId } from '@shared/id'

// Per-path promise chains so concurrent writes to the same file never interleave.
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(
    key,
    next.catch(() => undefined)
  )
  return next
}

/** Write-temp-then-rename in the same directory; rename is atomic on APFS. */
export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  return enqueue(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${newId(6)}.tmp`
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.writeFile(JSON.stringify(data, null, 2) + '\n', 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fs.rename(tmp, file)
  })
}

/**
 * Read + parse JSON. Missing file → null. Corrupt file → quarantined as
 * `<file>.corrupt-<ts>` (never silently deleted) and null returned.
 */
export async function readJson<T>(file: string): Promise<T | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const quarantine = `${file}.corrupt-${Date.now()}`
    console.error(`[jsonStore] corrupt JSON in ${file}, quarantining to ${quarantine}`)
    await fs.rename(file, quarantine).catch(() => undefined)
    return null
  }
}

export function appendLine(file: string, line: string): Promise<void> {
  return enqueue(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, line.endsWith('\n') ? line : line + '\n', 'utf8')
  })
}

export async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const names = await fs.readdir(dir)
    return names.filter((n) => n.endsWith(ext)).map((n) => path.join(dir, n))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}
