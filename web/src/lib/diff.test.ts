import { describe, expect, it } from 'vitest'
import { changedRules, classifyDiff, diffStats } from './diff'

const lines = ['--- a', '+++ b', '@@ -1,3 +1,3 @@', ' rule Alice_Send:', '-  [ Out(x) ]', '+  [ Out_Auth(x) ]', '+rule Eve_Reflect:']

describe('diff helpers', () => {
  it('classifies unified diff lines', () => {
    expect(classifyDiff(lines).map((l) => l.kind)).toEqual(['file', 'file', 'hunk', 'context', 'del', 'add', 'add'])
  })
  it('counts added and removed lines and hunks', () => {
    expect(diffStats(classifyDiff(lines))).toEqual({ added: 2, removed: 1, hunks: 1 })
  })
  it('finds rule names that changed', () => {
    expect(changedRules(classifyDiff(lines))).toEqual(['Eve_Reflect'])
  })
})
