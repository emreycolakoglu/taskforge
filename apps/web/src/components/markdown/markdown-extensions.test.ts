import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { createMarkdownExtensions, getMarkdown, sanitizeHref } from './markdown-extensions'

/**
 * Round-trips markdown through a headless editor: parse → doc → serialize.
 * Exercises the real tiptap-markdown config the app ships.
 */
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: createMarkdownExtensions(),
    content: markdown,
  })
  const out = getMarkdown(editor)
  editor.destroy()
  return out.trim()
}

describe('sanitizeHref', () => {
  it('allows http, https, and mailto', () => {
    expect(sanitizeHref('http://example.com')).toBe('http://example.com')
    expect(sanitizeHref('https://example.com/x')).toBe('https://example.com/x')
    expect(sanitizeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
  })

  it('rejects javascript:, data:, and vbscript: schemes', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeHref('JavaScript:alert(1)')).toBeNull()
    expect(sanitizeHref('data:text/html,<script>')).toBeNull()
    expect(sanitizeHref('vbscript:msgbox')).toBeNull()
  })

  it('allows relative paths and fragments (no scheme)', () => {
    expect(sanitizeHref('/board/123')).toBe('/board/123')
    expect(sanitizeHref('#section')).toBe('#section')
    expect(sanitizeHref('./relative')).toBe('./relative')
  })

  it('trims and rejects empty/nullish input', () => {
    expect(sanitizeHref('  https://x.com  ')).toBe('https://x.com')
    expect(sanitizeHref('')).toBeNull()
    expect(sanitizeHref('   ')).toBeNull()
    expect(sanitizeHref(null)).toBeNull()
    expect(sanitizeHref(undefined)).toBeNull()
  })
})

describe('markdown round-trip', () => {
  it('preserves headings', () => {
    expect(roundTrip('# Title')).toContain('# Title')
    expect(roundTrip('## Sub')).toContain('## Sub')
  })

  it('preserves bold and italic', () => {
    expect(roundTrip('**bold**')).toContain('**bold**')
    expect(roundTrip('a *em* b')).toMatch(/[*_]em[*_]/)
  })

  it('preserves bullet and ordered lists', () => {
    const bullets = roundTrip('- one\n- two')
    expect(bullets).toContain('one')
    expect(bullets).toMatch(/^[-*] one/m)
    expect(roundTrip('1. first\n2. second')).toMatch(/1\. first/)
  })

  it('preserves GFM task-list checkboxes', () => {
    const out = roundTrip('- [ ] todo\n- [x] done')
    expect(out).toContain('[ ] todo')
    expect(out).toContain('[x] done')
  })

  it('preserves inline code and fenced code blocks', () => {
    expect(roundTrip('use `code` here')).toContain('`code`')
    expect(roundTrip('```\nconst x = 1\n```')).toContain('const x = 1')
    expect(roundTrip('```\nconst x = 1\n```')).toContain('```')
  })

  it('preserves blockquotes and links', () => {
    expect(roundTrip('> quoted')).toMatch(/^> quoted/m)
    expect(roundTrip('[text](https://example.com)')).toContain('[text](https://example.com)')
  })

  it('drops raw HTML (no stored-XSS surface)', () => {
    const out = roundTrip('hello <script>alert(1)</script> world')
    expect(out).not.toContain('<script>')
    expect(out).toContain('hello')
    expect(out).toContain('world')
  })
})
