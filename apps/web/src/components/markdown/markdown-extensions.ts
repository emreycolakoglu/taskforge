/**
 * TipTap extension set + link sanitizing for the markdown editor.
 *
 * Kept free of React so the config (and the security-critical `sanitizeHref`)
 * can be unit-tested by instantiating a headless editor — see
 * `markdown-extensions.test.ts`.
 *
 * Design decisions (see the description-markdown plan):
 * - Storage format is **markdown**; `tiptap-markdown` serializes/parses it.
 * - Raw HTML is disallowed (`html: false`) — no sanitizer dependency, no
 *   stored-XSS surface from agent- or human-authored descriptions.
 * - Links are restricted to safe protocols; `javascript:`/`data:` are dropped.
 * - Feature set is core prose + GFM task-list checkboxes. No tables, no images.
 */

import StarterKit from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import type { Editor, Extensions } from '@tiptap/core'

const SAFE_PROTOCOLS = ['http', 'https', 'mailto'] as const

/**
 * Returns the href unchanged when it is safe to render, or `null` when it must
 * be dropped. Relative links and bare fragments are allowed; anything carrying
 * an explicit scheme outside {http, https, mailto} (notably `javascript:`,
 * `data:`, `vbscript:`) is rejected.
 */
export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed) return null

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!schemeMatch) {
    // No scheme → relative path or fragment. Safe.
    return trimmed
  }

  const scheme = schemeMatch[1].toLowerCase()
  return SAFE_PROTOCOLS.includes(scheme as (typeof SAFE_PROTOCOLS)[number])
    ? trimmed
    : null
}

/**
 * Serializes the editor's current document to markdown. tiptap-markdown adds a
 * `markdown` storage slot but doesn't augment @tiptap/core's `Storage` type, so
 * this narrows it in one place instead of casting at every call site.
 */
export function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
}

interface MarkdownExtensionsOptions {
  placeholder?: string
}

export function createMarkdownExtensions(
  options: MarkdownExtensionsOptions = {},
): Extensions {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: [...SAFE_PROTOCOLS],
        isAllowedUri: (url) => sanitizeHref(url) !== null,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: options.placeholder ?? 'Add a description…',
    }),
    Markdown.configure({
      html: false,
      linkify: true,
      breaks: false,
      transformPastedText: true,
    }),
  ]
}
