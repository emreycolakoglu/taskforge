import { Link } from 'react-router-dom'
import { Home, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** 404 page — shown for any undefined route */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <FileQuestion className="size-16 text-muted-foreground/50" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">
          <Home className="size-4" data-icon="inline-start" />
          Back to Boards
        </Link>
      </Button>
    </div>
  )
}