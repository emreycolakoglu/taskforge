import { useState, useEffect, type FormEvent } from 'react';
import { Copy, LinkIcon, Ban, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User, UpdateSettingsPayload } from '@/types';
import { useAuth } from '@/contexts/auth-context';
import { useSettings, useUpdateSettings, useSendTestEmail } from '@/hooks/use-settings';
import {
  useUsers,
  useInvites,
  useCreateInvite,
  useRevokeInvite,
  useDeleteUser,
} from '@/hooks/use-users';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} aria-label={label}>
      <Copy className="size-3.5" />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function GeneralTab() {
  const { user } = useAuth();
  const { data: settings, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();
  const isAdmin = user?.role === 'admin';

  const [title, setTitle] = useState('');

  useEffect(() => {
    if (settings?.title) {
      setTitle(settings.title);
    }
  }, [settings?.title]);

  const handleSaveTitle = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    updateSettings.mutate({ title: title.trim() });
  };

  return (
    <div className="flex flex-col gap-6">
      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load instance settings. Try refreshing the page.
          </AlertDescription>
        </Alert>
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
                  <Label
                    htmlFor="instance-title"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Instance Title
                  </Label>
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
  );
}

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteUser.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading users...</div>;
  }

  if (!users?.length) {
    return <div className="py-8 text-center text-muted-foreground">No users yet</div>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.displayName}
                  {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                </TableCell>
                <TableCell>{formatRelativeDate(u.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(u)}
                    disabled={isSelf}
                    title={isSelf ? 'You cannot delete your own account' : 'Delete user'}
                    aria-label={`Delete ${u.displayName}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{pendingDelete?.displayName}&rdquo;? Their
              board memberships and sessions are removed, and their comments and activity are kept
              but unattributed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitesTab() {
  const { data: invites, isLoading } = useInvites();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createInvite.mutateAsync(inviteEmail.trim() || undefined);
      const link = `${window.location.origin}/signup/${result.token}`;
      await navigator.clipboard.writeText(link);
      toast.success(
        inviteEmail.trim()
          ? 'Invite created — emailed and copied to clipboard'
          : 'Invite link copied to clipboard',
      );
      setInviteEmail('');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (id: string) => {
    revokeInvite.mutate(id);
  };

  const getStatus = (invite: { isUsed: boolean; isExpired: boolean }) => {
    if (invite.isUsed) return 'used' as const;
    if (invite.isExpired) return 'expired' as const;
    return 'pending' as const;
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading invites...</div>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {invites?.length ?? 0} invite{invites?.length === 1 ? '' : 's'}
        </h3>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Invite recipient email"
            className="w-56"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com (optional)"
          />
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            <Plus className="size-4" />
            Create Invite
          </Button>
        </div>
      </div>

      {!invites?.length ? (
        <div className="py-8 text-center text-muted-foreground">No invites yet</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => {
              const status = getStatus(invite);
              const link = `${window.location.origin}/signup/${invite.token}`;
              const isPending = status === 'pending';

              return (
                <TableRow key={invite.id}>
                  <TableCell className="font-mono text-xs">{invite.token.slice(0, 8)}...</TableCell>
                  <TableCell>{invite.creatorName}</TableCell>
                  <TableCell>{invite.recipientEmail ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        status === 'pending'
                          ? 'default'
                          : status === 'used'
                            ? 'secondary'
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
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function EmailTab() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const sendTestEmail = useSendTestEmail();
  const { user } = useAuth();

  const [form, setForm] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUsername: '',
    smtpPassword: '',
    smtpFromEmail: '',
    smtpFromName: '',
    smtpSecure: true,
  });
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!settings) return;
    setForm({
      smtpHost: settings.smtpHost ?? '',
      smtpPort: settings.smtpPort?.toString() ?? '',
      smtpUsername: settings.smtpUsername ?? '',
      smtpPassword: '',
      smtpFromEmail: settings.smtpFromEmail ?? '',
      smtpFromName: settings.smtpFromName ?? '',
      smtpSecure: settings.smtpSecure,
    });
  }, [settings]);

  const buildPayload = (): UpdateSettingsPayload => {
    const port = parseInt(form.smtpPort, 10);
    const payload: UpdateSettingsPayload = {
      smtpHost: form.smtpHost || null,
      smtpPort: Number.isFinite(port) ? port : null,
      smtpUsername: form.smtpUsername || null,
      smtpFromEmail: form.smtpFromEmail || null,
      smtpFromName: form.smtpFromName || null,
      smtpSecure: form.smtpSecure,
    };
    if (form.smtpPassword !== '') payload.smtpPassword = form.smtpPassword;
    return payload;
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(buildPayload());
  };

  const handleTest = () => {
    if (testTo.trim()) sendTestEmail.mutate(testTo.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email (SMTP)</CardTitle>
        <CardDescription>Used to send invite emails and (later) password resets.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                aria-label="SMTP Host"
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                aria-label="Port"
                type="number"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
                placeholder="587"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-user">Username</Label>
              <Input
                id="smtp-user"
                aria-label="Username"
                value={form.smtpUsername}
                onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-pass">Password</Label>
              <Input
                id="smtp-pass"
                aria-label="Password"
                type="password"
                value={form.smtpPassword}
                placeholder={settings?.smtpPasswordSet ? '••••••' : ''}
                onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {settings?.smtpPasswordSet
                  ? 'A password is set — leave blank to keep it.'
                  : 'No password set.'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-from">From Email</Label>
              <Input
                id="smtp-from"
                aria-label="From Email"
                type="email"
                value={form.smtpFromEmail}
                onChange={(e) => setForm({ ...form, smtpFromEmail: e.target.value })}
                placeholder="noreply@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="smtp-from-name">From Name</Label>
              <Input
                id="smtp-from-name"
                aria-label="From Name"
                value={form.smtpFromName}
                onChange={(e) => setForm({ ...form, smtpFromName: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="smtp-secure"
              checked={form.smtpSecure}
              onCheckedChange={(v) => setForm({ ...form, smtpSecure: v })}
            />
            <Label htmlFor="smtp-secure">Use TLS (secure) connection</Label>
          </div>
          <div className="flex items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Input
              aria-label="Test recipient"
              className="w-64"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={user?.email ?? 'you@example.com'}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={sendTestEmail.isPending || !testTo.trim()}
            >
              {sendTestEmail.isPending ? 'Sending…' : 'Send test email'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your preferences</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {isAdmin && <TabsTrigger value="email">Email</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="invites">Invites</TabsTrigger>}
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="email" className="mt-4">
            <EmailTab />
          </TabsContent>
        )}
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
  );
}
