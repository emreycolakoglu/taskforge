/**
 * DetailEstimateInput — freeform numeric estimate row for the properties sidebar.
 *
 * A plain number input (no preset scale). Empty input means no estimate; any
 * non-empty value parses to a number and clears the field into a placeholder
 * when set to null. Commits on blur and Enter so typing partial values like "5."
 * never fires a premature update.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { DetailPropertyRow } from './detail-property-row';

interface DetailEstimateInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function DetailEstimateInput({ value, onChange }: DetailEstimateInputProps) {
  const [text, setText] = useState(value === null ? '' : String(value));

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      onChange(null);
    } else {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        onChange(parsed);
      }
    }
  };

  return (
    <DetailPropertyRow label="Estimate">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="No estimate"
        aria-label="Estimate"
        className="h-7 w-20 px-2 text-sm text-right font-mono"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </DetailPropertyRow>
  );
}
