import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/hooks/api';
import { useCreateInvite } from '@/hooks/use-users';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function AccountPage() {
  const { user, updateUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const createInvite = useCreateInvite();

  if (!user) return null;

  const handleNameUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateUser({ displayName });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success("Name updated");
    } catch (err) {
      toast.error("Failed to update name", { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handlePasswordUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await updateUser({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success("Password updated");
    } catch (err) {
      toast.error("Failed to update password", { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleInvite = () => {
    createInvite.mutate(undefined, {
      onSuccess: (res) => {
        const url = `${window.location.origin}/signup/${res.token}`;
        navigator.clipboard.writeText(url);
        toast.success("Invite link copied to clipboard", { description: url });
      },
      onError: (err) => {
        toast.error("Failed to create invite", { description: err.message });
      },
    });
  };

  const handleBotToken = async () => {
    try {
      const res = await api.auth.createBotToken();
      await navigator.clipboard.writeText(res.token);
      toast.success("Bot token created", { description: res.token });
    } catch (err) {
      toast.error("Failed to create bot token", { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile and settings
        </p>
      </div>

      {/* Profile info */}
      <Card className="space-y-3">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{user.email}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge></div>
          </div>
        </CardContent>
      </Card>

      {/* Change display name */}
      <Card className="space-y-3">
        <CardHeader>
          <CardTitle className="text-base">Display Name</CardTitle>
          <CardDescription>Update how your name appears to others</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-fit">Save Name</Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="space-y-3">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Update your password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
              <Input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-fit">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Admin actions */}
      {user.role === 'admin' && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="text-base">Admin</CardTitle>
            <CardDescription>Invite new members or create bot tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button onClick={handleInvite} disabled={createInvite.isPending}>
                Copy Invite Link
              </Button>
              <Button onClick={handleBotToken}>
                Create Bot Token
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      <Button variant="destructive" onClick={logout}>
        Sign Out
      </Button>
    </div>
  );
}