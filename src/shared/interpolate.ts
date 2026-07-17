// Postman-style {{name}} is the canonical syntax; legacy ${name} still resolves.
export const VAR_RE = /\{\{\s*(\$?[A-Za-z_][\w-]*)\s*\}\}|\$\{(\$?[A-Za-z_][\w-]*)\}/g

export function varName(match: RegExpExecArray | string[]): string {
  return (match[1] ?? match[2]) as string
}

export interface InterpolateResult {
  text: string
  unresolved: string[]
}

/**
 * Resolve `{{name}}` (or legacy `${name}`) from vars, plus dynamic built-ins
 * `{{$uuid}}` / `{{$timestamp}}`. With `dynamic: false` (renderer preview)
 * built-ins are left literal so they evaluate fresh at send time in main.
 */
export function interpolate(
  text: string,
  vars: Record<string, string>,
  opts: { dynamic: boolean } = { dynamic: true }
): InterpolateResult {
  const unresolved: string[] = []
  const out = text.replace(VAR_RE, (whole, curly: string | undefined, legacy: string | undefined) => {
    const name = (curly ?? legacy)!
    if (name.startsWith('$')) {
      if (!opts.dynamic) return whole
      if (name === '$uuid') return globalThis.crypto.randomUUID()
      if (name === '$timestamp') return String(Math.floor(Date.now() / 1000))
      unresolved.push(name)
      return whole
    }
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name]
    unresolved.push(name)
    return whole
  })
  return { text: out, unresolved }
}

export function varsFromEnv(variables: { key: string; value: string; enabled: boolean }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const v of variables) if (v.enabled && v.key) map[v.key] = v.value
  return map
}
