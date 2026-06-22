import { useState, useEffect, type FormEvent } from 'react'
import { Copy, LinkIcon, Ban, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { useUsers, useInvites, useCreateInvite, useRevokeInvite } from '@/hooks/use-users'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} aria-label={label}>
      <Copy className="size-3.5" />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function GeneralTab() {
  const { user } = useAuth()
  const { data: settings, isLoading, isError } = useSettings()
  const updateSettings = useUpdateSettings()
  const isAdmin = user?.role === 'admin'

  const [title, setTitle] = useState('')

  useEffect(() => {
    if (settings?.title) {
      setTitle(settings.title)
    }
  }, [settings?.title])

  const handleSaveTitle = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    updateSettings.mutate({ title: title.trim() })
  }

  return (
    <div className="flex flex-col gap-6">
      {isLoading && (
        <Card>
          <CardHeader>
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-9 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Error</CardTitle>
            <CardDescription>Failed to load instance settings. Try refreshing the page.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instance Settings</CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Configure the title shown across the app'
                : `Instance title: ${settings.title}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <form onSubmit={handleSaveTitle} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="instance-title" className="text-sm font-medium text-muted-foreground">Instance Title</Label>
                  <Input
                    id="instance-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="TaskForge"
                    disabled={updateSettings.isPending}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={updateSettings.isPending || !title.trim()}>
                    {updateSettings.isPending ? 'Saving…' : 'Save Title'}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only admins can change instance settings.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function UsersTab() {
  const { user: currentUser } = useAuth()
  const { data: users, isLoading } = useUsers()

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading users...</div>
  }

  if (!users?.length) {
    return <div className="py-8 text-center text-muted-foreground">No users yet</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Display Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">
              {u.displayName}
              {u.id === currentUser?.id && (
                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
              )}
            </TableCell>
            <TableCell>{u.email}</TableCell>
            <TableCell>
              <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                {u.role}
              </Badge>
            </TableCell>
            <TableCell>{formatRelativeDate(u.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function InvitesTab() {
  const { data: invites, isLoading } = useInvites()
  const createInvite = useCreateInvite()
  const revokeInvite = useRevokeInvite()
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await createInvite.mutateAsync(undefined as never)
      const link = `${window.location.origin}/signup/${result.token}`
      await navigator.clipboard.writeText(link)
      toast.success("Invite link copied to clipboard")
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = (id: string) => {
    revokeInvite.mutate(id)
  }

  const getStatus = (invite: { isUsed: boolean; isExpired: boolean }) => {
    if (invite.isUsed) return 'used' as const
    if (invite.isExpired) return 'expired' as const
    return 'pending' as const
  }

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading invites...</div>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {invites?.length ?? 0} invite{invites?.length === 1 ? '' : 's'}
        </h3>
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          <Plus className="size-4" />
          Create Invite
        </Button>
      </div>

      {!invites?.length ? (
        <div className="py-8 text-center text-muted-foreground">No invites yet</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => {
              const status = getStatus(invite)
              const link = `${window.location.origin}/signup/${invite.token}`
              const isPending = status === 'pending'

              return (
                <TableRow key={invite.id}>
                  <TableCell className="font-mono text-xs">
                    {invite.token.slice(0, 8)}...
                  </TableCell>
                  <TableCell>{invite.creatorName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        status === 'pending' ? 'default'
                          : status === 'used' ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {status === 'pending' ? 'Pending' : status === 'used' ? 'Used' : 'Expired'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatRelativeDate(invite.expiresAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={link} target="_blank" rel="noreferrer">
                          <LinkIcon className="size-3.5" />
                          Link
                        </a>
                      </Button>
                      <CopyButton text={link} label="Copy invite link" />
                      {isPending && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={revokeInvite.isPending}
                        >
                          <Ban className="size-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="bg-background p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg font-medium tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your preferences
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="invites">Invites</TabsTrigger>}
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="invites" className="mt-4">
            <InvitesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}