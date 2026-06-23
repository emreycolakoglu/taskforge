/**
 * DetailActivity — timeline of task activity events.
 *
 * Rows: actor initial avatar (size-5, bg-muted) + actor (weight 510) + action
 * + detail + mono timestamp. "Show N more events…" expander using Collapsible
 * when activity.length > 5.
 */

import { Activity } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import type { Activity as ActivityType } from '@/types'

interface DetailActivityProps {
  activity: ActivityType[]
  formatTimestamp: (ts: string) => string
}

const VISIBLE_COUNT = 5

function ActivityRow({ a, formatTimestamp }: { a: ActivityType; formatTimestamp: (ts: string) => string }) {
  let extra = ''
  if (a.detail) {
    try {
      const d = JSON.parse(a.detail)
      extra = d.changes
        ? ` — ${d.changes.join(', ')}`
        : d.to
          ? ` → ${d.to}`
          : d.listName
            ? ` → ${d.listName}`
            : ''
    } catch {
      extra = ''
    }
  }

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground">
          {a.actor.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        <span className="text-sm font-medium text-foreground">{a.actor}</span>{' '}
        <span className="text-sm text-muted-foreground">{a.action}</span>
        {extra && <span className="text-sm text-muted-foreground">{extra}</span>}
        <span className="font-mono text-xs text-muted-foreground ml-2">
          {formatTimestamp(a.createdAt)}
        </span>
      </div>
    </div>
  )
}

export function DetailActivity({ activity, formatTimestamp }: DetailActivityProps) {
  if (activity.length === 0) return null

  const visible = activity.slice(0, VISIBLE_COUNT)
  const hidden = activity.slice(VISIBLE_COUNT)

  return (
    <section id="activity" className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Activity className="size-3.5" />
        Activity
      </h3>
      <div>
        {visible.map((a) => (
          <ActivityRow key={a.id} a={a} formatTimestamp={formatTimestamp} />
        ))}
        {hidden.length > 0 && (
          <Collapsible>
            <CollapsibleContent>
              {hidden.map((a) => (
                <ActivityRow key={a.id} a={a} formatTimestamp={formatTimestamp} />
              ))}
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground mt-1">
                <CollapsibleContextLabel count={hidden.length} />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </div>
    </section>
  )
}

/** Renders the "Show N more events…" label; uses Collapsible context internally. */
function CollapsibleContextLabel({ count }: { count: number }) {
  return <span>Show {count} more events…</span>
}