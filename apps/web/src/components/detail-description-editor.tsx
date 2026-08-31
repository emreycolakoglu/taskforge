/**
 * DetailDescriptionEditor — always-live markdown description on the task detail.
 *
 * No "Description" heading (Linear doesn't have one). The editor is always
 * mounted and editable; there is no Save/Cancel row. Edits autosave: debounced
 * ~1s after typing stops, and flushed immediately on blur so nothing is lost.
 * A save is skipped when the serialized markdown matches the server value, so
 * focus-in/out without edits does not spawn a mutation.
 *
 * Cross-task guard: a pending autosave is bound to the `value` (i.e. the task)
 * it was scheduled under. If the value is swapped for a different snapshot
 * (task-to-task navigation without a remount) mid-debounce, the pending save
 * is cancelled — otherwise a stale edit typed on the previous task would be
 * delivered to the new task's onSave (see TFG-45).
 *
 * The MarkdownEditor's remote-update guard keeps live WebSocket refetches from
 * clobbering the caret mid-edit (last-write-wins on the field).
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarkdownEditor } from '@/components/markdown';
import { useUserDirectory } from '@/hooks/use-users';
import { createAutosaver, type Autosaver } from '@/lib/autosave';

const AUTOSAVE_DELAY_MS = 1000;

interface DetailDescriptionEditorProps {
  value: string;
  onSave: (value: string) => void;
}

export function DetailDescriptionEditor({ value, onSave }: DetailDescriptionEditorProps) {
  const navigate = useNavigate();
  const { data: directory = [] } = useUserDirectory();
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);
  onSaveRef.current = onSave;
  valueRef.current = value;

  const saverRef = useRef<Autosaver<string> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createAutosaver<string>(
      (markdown) => {
        if (markdown !== valueRef.current) onSaveRef.current(markdown);
      },
      { delayMs: AUTOSAVE_DELAY_MS },
    );
  }

  // A pending save is only valid for the task snapshot it was typed under.
  // When the parent swaps in another task's value, drop it before the new
  // task's onSave can be wired up (TFG-45 race).
  const lastSeenValueRef = useRef(value);
  if (lastSeenValueRef.current !== value) {
    saverRef.current?.cancel();
    lastSeenValueRef.current = value;
  }

  // Flush any pending edit if the view unmounts (navigation away mid-edit).
  useEffect(() => () => saverRef.current?.flush(), []);

  return (
    <MarkdownEditor
      value={value}
      mentions={directory}
      onMentionClick={(userId) => navigate(`/tasks?assignee=${userId}`)}
      onChange={(markdown) => saverRef.current?.schedule(markdown)}
      onBlur={(markdown) => {
        saverRef.current?.schedule(markdown);
        saverRef.current?.flush();
      }}
    />
  );
}
