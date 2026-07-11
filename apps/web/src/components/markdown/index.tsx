/**
 * Public entry for the markdown editor. Feature code imports from here.
 *
 * The ProseMirror-based editor (~150kb) is code-split via `React.lazy` so it
 * stays out of the initial bundle — it only appears on the task detail page and
 * the create-task dialog. While the chunk loads, `MarkdownEditorSkeleton`
 * renders the current value as static, identically-styled `.markdown-body` text
 * at the same min-height, so swapping in the live editor causes no layout jump.
 */

import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import type { MarkdownEditorProps } from './markdown-editor'

const LazyMarkdownEditor = lazy(() => import('./markdown-editor'))

function MarkdownEditorSkeleton({
  value,
  placeholder,
  className,
}: Pick<MarkdownEditorProps, 'value' | 'placeholder' | 'className'>) {
  const isEmpty = value.trim().length === 0
  return (
    <div className={className} aria-busy="true">
      <div className="markdown-body min-h-[60px] whitespace-pre-wrap">
        {isEmpty ? (
          <span className="italic text-muted-foreground">
            {placeholder ?? 'Add a description…'}
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense
      fallback={
        <MarkdownEditorSkeleton
          value={props.value}
          placeholder={props.placeholder}
          className={cn(props.className)}
        />
      }
    >
      <LazyMarkdownEditor {...props} />
    </Suspense>
  )
}

export type { MarkdownEditorProps }
