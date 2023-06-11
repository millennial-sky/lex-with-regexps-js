const buildLexerRegExp = (regExps) => {
  let buf = []
  for (let [tokenKind, regexp] of Object.entries(regExps)) {
    buf.push(`(?<${tokenKind}>${regexp.source})`)
  }
  return new RegExp(buf.join("|"), "sy")
}

const matchNext = (index, str, lexerRegExp) => {
  // Setting `lastIndex` (while using the sticky flag "y") is how you tell RegExp#exec 
  // that the match should start exactly at that index
  lexerRegExp.lastIndex = index
  const match = lexerRegExp.exec(str)
  if (!match) return null
  
  const tokenKind = Object.keys(match.groups).find((k) => match.groups[k])
  
  return {
    kind: tokenKind,
    text: match[0]
  }
}

const nextLocation = (loc, text) => {
  const index = loc.index + text.length
  
  const line = loc.line + (text.match(/\n/g)?.length ?? 0)
  
  const lastNewlineIndex = text.lastIndexOf("\n")
  const column = (lastNewlineIndex >= 0) ?
    text.length - lastNewlineIndex :
    loc.column + text.length

  return {index, line, column}
}

export class SyntaxError extends Error {
  constructor(loc, src, msg) {
    const line = src.split("\n")[loc.line - 1]
    const marker = " ".repeat(loc.column - 1) + "^"
    super(`${loc.line}:${loc.column}: ${msg}\n${line}\n${marker}`)
    this.loc = loc
    this.src = src
  }
}

export const lex = (src, regExps) => {
  const lexerRegExp = buildLexerRegExp(regExps)
  const tokens = []
  let loc = {index: 0, line: 1, column: 1}
  while (loc.index < src.length) {
    const match = matchNext(loc.index, src, lexerRegExp)
    if (match == null) throw new SyntaxError(loc, src, "Unknown token")
    tokens.push({...match, loc})
    loc = nextLocation(loc, match.text)
  }
  return tokens
}
