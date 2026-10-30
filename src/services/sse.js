// Incrementally decode UTF-8 and SSE frames across arbitrary network chunks.
export async function* readSSE(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let match
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
      if (data) yield data
    }
    if (buffer.length > 1048576) throw new SyntaxError('Oversized SSE frame')
  }
  buffer += decoder.decode()
  if (buffer.trim()) throw new SyntaxError('Incomplete SSE frame')
}
