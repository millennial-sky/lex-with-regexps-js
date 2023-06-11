# Lexing with Regular Expressions

## Overview

This is a small (~50 lines of code) library the provides a simple API to tokenize strings using regular expressions.

Here is an example that we will use throughout the documentation

```javascript
import {lex} from "@millennial-sky/lex-with-regexps"

lex("one 42", {
  id: /[a-zA-Z_][a-zA-Z0-9_]*/,
  num: /\d+/,
  ws: /\s+/,
})
```

`lex` will return an array of tokens, which are objects of this form

```javascript
{
  kind: "id",
  text: "one",
  loc: {index: 0, line: 1, column: 1}
}
```

The focus of the library is minimalism and ease of use in articles that have to parse small languages, not on performance (which shouldn't be too bad anyway, but we go over the input more than once to compute the location information).

The library is written in literate JavaScript, using [@millennial-sky/literate](https://www.npmjs.com/package/@millennial-sky/literate).

## Implementation

Given some string and an index, the lexer will need to find which (if any) of the regular expressions matches at that index.

### Merging the regular expressions

We could loop through each regexp and try it, but it's better to let the JavaScript RegExp engine do the heavy lifting.

The idea is to build a regular expression that uses named capture groups to differentiate between the token kinds

```javascript
const log = console.log
log(
  /(?<id>[a-zA-Z_][a-zA-Z0-9_]*)|(?<num>\d+)|(?<ws>\s+)/sy.exec("one 42")
)
//>  [
//>    'one',
//>    'one',
//>    undefined,
//>    undefined,
//>    index: 0,
//>    input: 'one 42',
//>    groups: [Object: null prototype] { id: 'one', num: undefined, ws: undefined }
//>  ]
```

The `y` flag (called "sticky") will allow us to decide at which index the match should begin. The `s` flag ("dotAll") makes the `.` match newlines.

The function that merges the regular expressions is this

```javascript
const buildLexerRegExp = (regExps) => {
  let buf = []
  for (let [tokenKind, regexp] of Object.entries(regExps)) {
    buf.push(`(?<${tokenKind}>${regexp.source})`)
  }
  return new RegExp(buf.join("|"), "sy")
}
```

So in our example

```javascript
const regExps = {
  id: /[a-zA-Z_][a-zA-Z0-9_]*/,
  num: /\d+/,
  ws: /\s+/,
}

const lexerRegExp = buildLexerRegExp(regExps)
log(lexerRegExp)
//>  /(?<id>[a-zA-Z_][a-zA-Z0-9_]*)|(?<num>\d+)|(?<ws>\s+)/sy
```

We could have used regular capture groups instead of the named ones, but that would have been less robust: the user would have had to remember to use non-capture groups `(?:...)` in their regexps to avoid bugs. On the other hand users have no reason to use named capture groups.

### Finding the next token

Now that we have a single regular expression, we can use it to find the next token

```javascript
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
```

so

```javascript
log(matchNext(0, "one 42", lexerRegExp))
log(matchNext(3, "one 42", lexerRegExp))
log(matchNext(4, "one 42", lexerRegExp))
log(matchNext(0, "+", lexerRegExp))
//>  { kind: 'id', text: 'one' }
//>  { kind: 'ws', text: ' ' }
//>  { kind: 'num', text: '42' }
//>  null
```

### The source location and its advancement

We want to add location information to the tokens, i.e. the index, line and column where the tokens begin.

The location of the first token is always

```javascript
{index: 0, line: 1, column: 1}
```

After we match a token we can use its text to get the starting location of the next token.
The rules are easy:
* the **index** increases by the length of the token text
* the **line** increases by the number of newlines in the token text
* the **column**
  * if the token text contains a newline, it is the number of characters after the last newline
  * otherwise it increases by the length of the token text

```javascript
const nextLocation = (loc, text) => {
  const index = loc.index + text.length
  
  const line = loc.line + (text.match(/\n/g)?.length ?? 0)
  
  const lastNewlineIndex = text.lastIndexOf("\n")
  const column = (lastNewlineIndex >= 0) ?
    text.length - lastNewlineIndex :
    loc.column + text.length

  return {index, line, column}
}
```

We try it out on a few made up token strings

```javascript
log(nextLocation({index: 0, line: 1, column: 1}, "aaa \n bb"))
log(nextLocation({index: 0, line: 1, column: 1}, "aaa \n  \n bb"))
log(nextLocation({index: 0, line: 1, column: 1}, "aa"))
//>  { index: 8, line: 2, column: 4 }
//>  { index: 11, line: 3, column: 4 }
//>  { index: 2, line: 1, column: 3 }
```

### Errors

If the lexer regexp doesn't match we want to throw a specialized Error containing all the relevant information

```javascript
export class SyntaxError extends Error {
  constructor(loc, src, msg) {
    const line = src.split("\n")[loc.line - 1]
    const marker = " ".repeat(loc.column - 1) + "^"
    super(`${loc.line}:${loc.column}: ${msg}\n${line}\n${marker}`)
    this.loc = loc
    this.src = src
  }
}
```

For example

```javascript
try {
  throw new SyntaxError({index: 3, line: 1, column: 4}, "one 42", "Made up error")
} catch (e) {
  log(e.message)
}
//>  1:4: Made up error
//>  one 42
//>     ^
```

### Putting it all together

We can now write the function that does the lexing

```javascript
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
```

Lets try it out

```javascript
log(lex("one 42", regExps))
//>  [
//>    { kind: 'id', text: 'one', loc: { index: 0, line: 1, column: 1 } },
//>    { kind: 'ws', text: ' ', loc: { index: 3, line: 1, column: 4 } },
//>    { kind: 'num', text: '42', loc: { index: 4, line: 1, column: 5 } }
//>  ]
```

while a failure looks like this

```javascript
try {
  lex("one + 42", regExps)
} catch (e) {
  log(e.message)
}
//>  1:5: Unknown token
//>  one + 42
//>      ^
```