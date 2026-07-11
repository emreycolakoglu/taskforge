/**
 * MarkdownEditor — TipTap WYSIWYG that reads and writes **markdown** strings.
 *
 * This is the heavy (ProseMirror) chunk. It is never imported directly by
 * feature code — always go through `./index` (lazy-loaded with a non-jumping
 * placeholder). Default-exported for `React.lazy`.
 *
 * Two usage modes, both supported by the same props:
 * - Controlled (create dialog): pass `onChange`; the parent owns the value.
 * - Always-live w/ autosave (detail view): pass `onChange` + `onBlur`; the
 *   wrapper debounces saves and flushes on blur.
 *
 * Remote-update guard: while the editor is focused we ignore incoming `value`
 * changes so a live WebSocket refetch can't clobber the caret mid-edit. When
 * not focused, external updates sync in. This matches the app's last-write-wins
 * model (see the description-markdown plan, Q7).
 */

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, Strikethrough, Code, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createMarkdownExtensions, getMarkdown, sanitizeHref } from './markdown-extensions'
import { shouldSyncExternalValue } from './sync-guard'

export interface MarkdownEditorProps {
  /** Markdown source. Also the external-sync source (guarded while focused). */
  value: string
  editable?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
  /** Fires on every edit with the serialized markdown. */
  onChange?: (markdown: string) => void
  /** Fires on blur with the serialized markdown (used to flush autosave). */
  onBlur?: (markdown: string) => void
}

export default function MarkdownEditor({
  value,
  editable = true,
  autoFocus = false,
  placeholder,
  className,
  onChange,
  onBlur,
}: MarkdownEditorProps) {
  // Refs keep the editor instance stable across handler-identity changes.
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  const editor = useEditor({
    editable,
    autofocus: autoFocus ? 'end' : false,
    extensions: createMarkdownExtensions({ placeholder }),
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'markdown-body focus:outline-none min-h-[60px]',
          !editable && 'cursor-default',
        ),
      },
    },
    onUpdate: ({ editor }) => {
      if (editor.isDestroyed) return
      onChangeRef.current?.(getMarkdown(editor))
    },
    onBlur: ({ editor }) => {
      if (editor.isDestroyed) return
      onBlurRef.current?.(getMarkdown(editor))
    },
  })

  // Keep `editable` in sync if it changes after mount.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Remote-update guard: only pull external `value` into the editor when the
  // user is not actively editing, and only when it actually differs from what
  // the editor already holds (prevents caret resets and update loops).
  useEffect(() => {
    // Under React.StrictMode the double-mount can hand us a destroyed editor
    // (storage torn down) before the live instance settles — touching its
    // storage would throw. Skip; the effect re-runs once a live editor arrives.
    if (!editor || editor.isDestroyed) return
    const current = getMarkdown(editor)
    if (shouldSyncExternalValue({ isFocused: editor.isFocused, current, incoming: value })) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  const toggleLink = () => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const input = window.prompt('Link URL')
    if (input === null) return
    const href = sanitizeHref(input)
    if (!href) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().setLink({ href }).run()
  }

  if (!editor) return null

  return (
    <>
      {editable && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-(--shadow-xl)"
        >
          <MarkButton
            label="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-3.5" />
          </MarkButton>
          <MarkButton
            label="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-3.5" />
          </MarkButton>
          <MarkButton
            label="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-3.5" />
          </MarkButton>
          <MarkButton
            label="Code"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-3.5" />
          </MarkButton>
          <MarkButton label="Link" active={editor.isActive('link')} onClick={toggleLink}>
            <Link2 className="size-3.5" />
          </MarkButton>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className={className} />
    </>
  )
}

interface MarkButtonProps {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function MarkButton({ label, active, onClick, children }: MarkButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // Prevent the bubble menu from stealing selection/focus before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}
