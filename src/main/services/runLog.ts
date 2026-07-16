import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Run, RunSummary, RunsQuery } from '@shared/types'
import { toSummary } from '@shared/types'
import { appendLine, listFiles } from './jsonStore'
import { files } from './paths'
import { dayKey } from './seed'

interface FileCache {
  mtimeMs: number
  summaries: RunSummary[]
  ids: Set<string>
}

const cache = new Map<string, FileCache>()

function parseLines(raw: string): Run[] {
  const runs: Run[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      runs.push(JSON.parse(trimmed) as Run)
    } catch {
      // A crash mid-append can leave one malformed trailing line — skip it.
      console.warn('[runLog] skipping malformed run line')
    }
  }
  return runs
}

async function readFileCached(file: string): Promise<FileCache> {
  const stat = await fs.stat(file)
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit
  const runs = parseLines(await fs.readFile(file, 'utf8'))
  const entry: FileCache = {
    mtimeMs: stat.mtimeMs,
    summaries: runs.map(toSummary),
    ids: new Set(runs.map((r) => r.id))
  }
  cache.set(file, entry)
  return entry
}

export async function appendRun(run: Run): Promise<void> {
  const file = path.join(files.runsDir(), `${dayKey(run.ts)}.jsonl`)
  await appendLine(file, JSON.stringify(run))
  cache.delete(file)
}

export async function listRuns(query: RunsQuery = {}): Promise<RunSummary[]> {
  const paths = (await listFiles(files.runsDir(), '.jsonl')).sort().reverse()
  const out: RunSummary[] = []
  for (const p of paths) {
    const { summaries } = await readFileCached(p)
    out.push(...summaries)
  }
  out.sort((a, b) => b.ts - a.ts)
  let filtered = out
  if (query.requestId) filtered = filtered.filter((s) => s.requestId === query.requestId)
  if (query.method && query.method !== 'all') filtered = filtered.filter((s) => s.method === query.method)
  if (query.statusClass === '2xx') filtered = filtered.filter((s) => !s.error && (s.status ?? 0) < 400)
  if (query.statusClass === '4xx') filtered = filtered.filter((s) => s.error || (s.status ?? 0) >= 400)
  return query.limit ? filtered.slice(0, query.limit) : filtered
}

export async function getRun(id: string): Promise<Run | null> {
  const paths = (await listFiles(files.runsDir(), '.jsonl')).sort().reverse()
  for (const p of paths) {
    const entry = await readFileCached(p)
    if (!entry.ids.has(id)) continue
    const runs = parseLines(await fs.readFile(p, 'utf8'))
    return runs.find((r) => r.id === id) ?? null
  }
  return null
}

export async function allRuns(): Promise<Run[]> {
  const paths = (await listFiles(files.runsDir(), '.jsonl')).sort()
  const out: Run[] = []
  for (const p of paths) out.push(...parseLines(await fs.readFile(p, 'utf8')))
  return out
}
