import { describe, expect, it } from 'vitest'
import { parseSseBlock, parseSseChunks } from './sse'

describe('parseSseChunks', () => {
  it('splits complete events and keeps the remainder', () => {
    const buf = 'event: status\ndata: {"label":"x"}\n\nevent: tick\ndata: {}\n\nevent: log\ndata: {"line":'
    const { events, rest } = parseSseChunks(buf)
    expect(events.map((e) => e.event)).toEqual(['status', 'tick'])
    expect(events[0].data).toBe('{"label":"x"}')
    expect(rest).toBe('event: log\ndata: {"line":')
  })
  it('handles CRLF and multi-line data', () => {
    const { events } = parseSseChunks('event: log\r\ndata: a\r\ndata: b\r\n\r\n')
    expect(events[0]).toEqual({ event: 'log', data: 'a\nb', id: undefined })
  })
  it('ignores comments and defaults the event name', () => {
    expect(parseSseBlock(': heartbeat')).toBeNull()
    expect(parseSseBlock('data: x')).toEqual({ event: 'message', data: 'x', id: undefined })
  })
})
