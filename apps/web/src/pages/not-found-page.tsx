import { Link } from 'react-router-dom'
import { Home, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** 404 page — shown for any undefined route */
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4 px-6 text-center">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Page not found</h1>
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