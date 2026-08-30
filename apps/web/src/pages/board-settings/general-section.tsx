import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/hooks/api';
import { Input } from '@/components/ui/input';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { EmojiPicker } from '@/components/emoji-picker';

export function GeneralSection({
  boardId,
  boardName,
  boardIcon,
}: {
  boardId: string;
  boardName: string;
  boardIcon: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(boardName);
  const [icon, setIcon] = useState(boardIcon);

  const handleIconChange = async (newIcon: string) => {
    setIcon(newIcon);
    try {
      await api.boards.update(boardId, { icon: newIcon });
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Board icon updated');
    } catch (err) {
      toast.error('Failed to update icon', {
        description: err instanceof Error ? err.message : undefined,
      });
      setIcon(boardIcon);
    }
  };

  const handleNameBlur = async () => {
    if (name.trim() === boardName) return;
    try {
      await api.boards.update(boardId, { name: name.trim() });
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Board name updated');
    } catch (err) {
      toast.error('Failed to update name', {
        description: err instanceof Error ? err.message : undefined,
      });
      setName(boardName);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Board Info</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Change the board's emoji icon and name. Saved instantly.
        </CardDescription>
      </div>
      <div className="flex items-center gap-3">
        <EmojiPicker
          value={icon}
          onChange={handleIconChange}
          className="size-10 text-xl border border-border"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="flex-1"
          aria-label="Board name"
        />
      </div>
    </Card>
  );
}
