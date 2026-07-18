import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Skeleton — pulsing placeholder shown while content loads.
 *
 * Compose several with explicit width/height utilities to mirror the shape of
 * the eventual content (a title bar, a paragraph, a control). Uses the Graphite
 * `bg-muted` token so it reads as an inert surface, not a live element.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
