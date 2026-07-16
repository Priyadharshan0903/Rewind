export type TokKind = 'key' | 'str' | 'num' | 'bool' | 'punct' | 'plain' | 'comment'

export interface Tok {
  kind: TokKind
  text: string
}

const JSON_RE = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g
const JS_RE =
  /(\/\/.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(-?\d+(?:\.\d+)?)|\b(true|false|null|const|let|var|assert|vars|res|console)\b/g

/** Single-pass, per-line tokenizer for the editor, viewer, and diff rows. */
export function tokenizeLine(line: string, language: 'json' | 'js'): Tok[] {
  const re = language === 'json' ? JSON_RE : JS_RE
  re.lastIndex = 0
  const toks: Tok[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m.index > last) toks.push({ kind: 'plain', text: line.slice(last, m.index) })
    if (language === 'json') {
      const [, str, colon, num, bool] = m
      if (str != null) {
        toks.push({ kind: colon ? 'key' : 'str', text: str })
        if (colon) toks.push({ kind: 'plain', text: colon })
      } else if (num != null) toks.push({ kind: 'num', text: num })
      else if (bool != null) toks.push({ kind: 'bool', text: bool })
    } else {
      const [, comment, str, num, kw] = m
      if (comment != null) toks.push({ kind: 'comment', text: comment })
      else if (str != null) toks.push({ kind: 'str', text: str })
      else if (num != null) toks.push({ kind: 'num', text: num })
      else if (kw != null) toks.push({ kind: ['res', 'vars', 'console'].includes(kw) ? 'key' : 'bool', text: kw })
    }
    last = m.index + m[0].length
  }
  if (last < line.length) toks.push({ kind: 'plain', text: line.slice(last) })
  return toks
}
