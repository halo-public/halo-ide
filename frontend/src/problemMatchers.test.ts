import { describe, expect, it } from 'vitest'
import { parseProblemOutput } from './problemMatchers'

describe('parseProblemOutput', () => {
  it('parses gcc and msbuild style diagnostics', () => {
    const output = [
      'src/app.ts:12:4: error: Cannot find name foo',
      "Program.cs(10,2): error CS1002: ; expected",
      'hello.js:3: warning: unused',
    ].join('\n')
    const problems = parseProblemOutput(output)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatchObject({ path: 'src/app.ts', line: 12, column: 4, severity: 'error' })
    expect(problems[1]).toMatchObject({ path: 'Program.cs', line: 10, column: 2, severity: 'error' })
    expect(problems[2].severity).toBe('warning')
  })
})
