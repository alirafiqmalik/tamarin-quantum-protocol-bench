/** Minimal Server-Sent Events parser over a text buffer (pure, testable). */
export interface SseEvent {
  event: string
  data: string
  id?: string
}

/**
 * Split a buffer into complete events. Events end with a blank line; the
 * remainder (an incomplete event) is returned as `rest` for the next call.
 */
export function parseSseChunks(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: SseEvent[] = []
  for (const block of parts) {
    const ev = parseSseBlock(block)
    if (ev) events.push(ev)
  }
  return { events, rest }
}

/** Parse one event block (lines without the terminating blank line). */
export function parseSseBlock(block: string): SseEvent | null {
  let event = 'message'
  let id: string | undefined
  const data: string[] = []
  let seen = false
  for (const raw of block.split('\n')) {
    if (!raw || raw.startsWith(':')) continue
    const colon = raw.indexOf(':')
    const field = colon === -1 ? raw : raw.slice(0, colon)
    let value = colon === -1 ? '' : raw.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    seen = true
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') id = value
  }
  if (!seen) return null
  return { event, data: data.join('\n'), id }
}
