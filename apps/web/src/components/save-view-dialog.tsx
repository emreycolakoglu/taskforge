/**
 * SaveViewDialog — "Save as view" dialog (board header flow).
 *
 * Fields: name (required) + visibility radio (Personal / Shared with board;
 * the shared option is hidden when `canShare=false`). `onSubmit` receives
 * `{ name, shared }` — the parent owns filters/groupBy/sortBy/layout and
 * forwards them to `useCreateView`. The confirm button is this overlay's
 * single Lime CTA (variant="default"); no other element here may use Lime.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  onSubmit: (data: { name: string; shared: boolean }) => void;
}

export function SaveViewDialog({ open, onOpenChange, canShare, onSubmit }: SaveViewDialogProps) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setShared(false);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, shared });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as view</DialogTitle>
          <DialogDescription>
            Saves the board&rsquo;s current filters, grouping and sorting as a reusable view.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="save-view-name">Name</Label>
            <Input
              id="save-view-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Urgent issues"
            />
          </div>
          <div className="grid gap-2">
            <Label>Visibility</Label>
            <RadioGroup
              value={shared ? 'shared' : 'personal'}
              onValueChange={(v) => setShared(v === 'shared')}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="personal" id="view-visibility-personal" />
                <Label htmlFor="view-visibility-personal" className="font-normal text-foreground">
                  Personal
                  <span className="block text-xs font-normal text-muted-foreground">
                    Only you can see this view
                  </span>
                </Label>
              </div>
              {canShare && (
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="shared" id="view-visibility-shared" />
                  <Label htmlFor="view-visibility-shared" className="font-normal text-foreground">
                    Shared with board
                    <span className="block text-xs font-normal text-muted-foreground">
                      All board members can use this view
                    </span>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
