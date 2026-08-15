import { describe, expect, it } from 'vitest'
import { folderLabel } from './workspaceMru'

describe('folderLabel', () => {
  it('returns the last Windows path segment', () => {
    expect(folderLabel('C:\\Users\\joe\\project')).toBe('project')
  })

  it('strips a trailing slash', () => {
    expect(folderLabel('/tmp/workspace/')).toBe('workspace')
  })
})
