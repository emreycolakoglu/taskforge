import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/hooks/api';
import { useCreateInvite } from '@/hooks/use-users';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function AccountPage() {
  const { user, updateUser, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [nameMsg, setNameMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [nameError, setNameError] = useState('');
  const [pwError, setPwError] = useState('');

  const createInvite = useCreateInvite();

  if (!user) return null;

  const handleNameUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameMsg('');
    try {
      await updateUser({ displayName });
      setNameMsg('Display name updated');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handlePasswordUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    if (newPassword !== confirmNewPassword) {
      setPwError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    try {
      await updateUser({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPwMsg('Password updated');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleInvite = () => {
    createInvite.mutate(undefined, {
      onSuccess: (res) => {
        const url = `${window.location.origin}/signup/${res.token}`;
        navigator.clipboard.writeText(url);
        alert(`Invite link copied to clipboard!\n\n${url}`);
      },
      onError: (err) => {
        alert(err.message || 'Failed to create invite');
      },
    });
  };

  const handleBotToken = async () => {
    try {
      const res = await api.auth.createBotToken();
      await navigator.clipboard.writeText(res.token);
      alert('Bot token copied to clipboard!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create bot token');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile and settings
        </p>
      </div>

      {/* Profile info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <div><span className="text-muted-foreground">Email:</span> {user.email}</div>
            <div><span className="text-muted-foreground">Role:</span> {user.role}</div>
          </div>
        </CardContent>
      </Card>

      {/* Change display name */}
      <Card className="mb-6">
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
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            {nameMsg && <p className="text-sm text-green-600">{nameMsg}</p>}
            <Button type="submit" className="w-fit">Save Name</Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="mb-6">
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
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwMsg && <p className="text-sm text-green-600">{pwMsg}</p>}
            <Button type="submit" className="w-fit">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Admin actions */}
      {user.role === 'admin' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Admin</CardTitle>
            <CardDescription>Invite new members or create bot tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleInvite} disabled={createInvite.isPending}>
                Copy Invite Link
              </Button>
              <Button variant="outline" onClick={handleBotToken}>
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