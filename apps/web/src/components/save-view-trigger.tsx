/**
 * SaveViewTrigger — "Save as view" ghost button for the filter row.
 *
 * Lives in the FilterChipsBar row (and the standalone row shown while a saved
 * view customizes filters) rather than the header toolbar: per the spec the
 * action appears only once the board's effective filter state deviates from
 * the default — on a pristine board there is nothing to save. Kept muted/ghost
 * so the save dialog's confirm button remains the only Lime CTA in the flow.
 */

import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SaveViewTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label="Save as view"
    >
      <Save className="size-3 mr-1" />
      Save as view
    </Button>
  );
}
