import MarkdownIt from 'markdown-it'

// Raw model HTML stays inert; markdown-it also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false })
markdown.disable('image')
export function renderMessageMarkdown(text) {
  return markdown.render(typeof text === 'string' ? text : '')
}
