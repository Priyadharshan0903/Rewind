import vm from 'node:vm'
import type { RunResponse, RunScriptResult } from '@shared/types'

/**
 * Runs the user's post-response script. These are the user's own local
 * scripts (Postman-tier threat model): the sandbox exists for crash/hang
 * containment and a minimal API, not as a hard security boundary. If Relay
 * ever executes scripts from untrusted/imported workspaces, move this into
 * an Electron utilityProcess — the function signature is designed for that.
 */
export function runScript(script: string, response: RunResponse): RunScriptResult {
  const result: RunScriptResult = { assertions: [], varsSet: {}, logs: [] }

  let json: unknown = null
  try {
    json = JSON.parse(response.bodyText)
  } catch {
    // non-JSON body: res.json stays null
  }

  const headers: Record<string, string> = {}
  for (const [k, v] of response.headers) headers[k.toLowerCase()] = v

  const res = Object.freeze({
    status: response.status,
    statusText: response.statusText,
    headers: Object.freeze(headers),
    json,
    text: response.bodyText
  })

  const sandbox = {
    res,
    vars: Object.freeze({
      set: (name: unknown, value: unknown) => {
        if (typeof name !== 'string' || !name) return
        result.varsSet[name] = String(value ?? '')
      },
      get: (name: unknown) => (typeof name === 'string' ? result.varsSet[name] : undefined)
    }),
    assert: (cond: unknown, message?: unknown) => {
      result.assertions.push({
        expr: typeof message === 'string' ? message : `assertion ${result.assertions.length + 1}`,
        pass: Boolean(cond),
        message: typeof message === 'string' ? message : undefined
      })
    },
    console: Object.freeze({
      log: (...args: unknown[]) => {
        result.logs.push(args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' '))
      }
    })
  }

  try {
    vm.runInNewContext(script, vm.createContext(sandbox), { timeout: 1000 })
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }
  return result
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
