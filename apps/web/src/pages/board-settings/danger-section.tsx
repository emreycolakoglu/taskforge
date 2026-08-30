import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useDeleteBoard } from '@/hooks/use-boards';
import { useMembers } from '@/hooks/use-members';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DeleteBoardSection({ boardId, boardName }: { boardId: string; boardName: string }) {
  const { user } = useAuth();
  const { data: members = [] } = useMembers(boardId);
  const deleteBoard = useDeleteBoard();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAdmin = members.some((m) => m.userId === user?.id && m.role === 'admin');

  const handleDelete = () => {
    deleteBoard.mutate(boardId, {
      onSuccess: () => {
        setConfirmOpen(false);
        navigate('/boards');
      },
    });
  };

  if (!isAdmin) return null;

  return (
    <Card className="p-6 space-y-4 border-destructive/40">
      <div>
        <CardTitle className="text-base text-foreground">Danger Zone</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Permanently delete this board and all of its tasks, comments, and labels. This cannot be
          undone.
        </CardDescription>
      </div>
      <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
        <Trash2 className="size-4 mr-1.5" />
        Delete Board
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete board</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{boardName}</strong>? This will permanently
              delete the board and all of its tasks, comments, and labels. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteBoard.isPending}>
              {deleteBoard.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
