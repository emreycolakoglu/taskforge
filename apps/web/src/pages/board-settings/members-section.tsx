import { useState } from 'react';
import { UserMinus, LogOut, UserPlus } from 'lucide-react';
import { useMembers, useAddMember, useRemoveMember, useLeaveBoard } from '@/hooks/use-members';
import { useUsers } from '@/hooks/use-users';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MembersSection({ boardId }: { boardId: string }) {
  const { user } = useAuth();
  const { data: members = [], isLoading } = useMembers(boardId);
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const leaveBoard = useLeaveBoard();
  const { data: users = [] } = useUsers();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const isAdmin = members.some((m) => m.userId === user?.id && m.role === 'admin');
  const currentMember = members.find((m) => m.userId === user?.id);

  const handleAdd = () => {
    if (!selectedUserId) return;
    addMember.mutate(
      { boardId, userId: selectedUserId },
      {
        onSuccess: () => {
          setAddOpen(false);
          setSelectedUserId('');
        },
      },
    );
  };

  const handleRemove = (userId: string) => {
    removeMember.mutate({ boardId, userId });
  };

  const handleLeave = () => {
    leaveBoard.mutate(boardId);
  };

  const availableUsers = users.filter((u) => !members.some((m) => m.userId === u.id));

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Members</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Manage who has access to this board. Members appear in the sidebar.
        </CardDescription>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="flex flex-col">
          {members.map((member) => {
            const memberUser = users.find((u) => u.id === member.userId);
            const isCurrentUser = member.userId === user?.id;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground text-xs font-semibold">
                    {memberUser?.displayName?.charAt(0).toUpperCase() ?? '?'}
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm text-foreground block truncate">
                      {memberUser?.displayName ?? 'Unknown user'}
                      {isCurrentUser && (
                        <span className="text-muted-foreground text-xs ml-1">(you)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{member.role}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && !isCurrentUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${memberUser?.displayName ?? 'member'}`}
                      onClick={() => handleRemove(member.userId)}
                      disabled={removeMember.isPending}
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground py-3">No members yet</p>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-border">
        {isAdmin && (
          <>
            {addOpen ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  aria-label="Select user to add"
                >
                  <option value="">Select a user...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={!selectedUserId || addMember.isPending}
                  >
                    {addMember.isPending ? 'Adding...' : 'Add'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddOpen(false);
                      setSelectedUserId('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="size-3.5 mr-1.5" />
                Add Member
              </Button>
            )}
          </>
        )}

        {currentMember && !isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleLeave}
            disabled={leaveBoard.isPending}
          >
            <LogOut className="size-3.5 mr-1.5" />
            {leaveBoard.isPending ? 'Leaving...' : 'Leave Board'}
          </Button>
        )}
      </div>
    </Card>
  );
}
