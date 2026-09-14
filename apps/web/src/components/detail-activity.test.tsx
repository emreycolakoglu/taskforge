import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailActivity } from './detail-activity';
import type { Activity } from '@/types';

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    id: 'a1',
    taskId: 't1',
    actor: 'Alice',
    action: 'moved',
    detail: '{"from":"status-1","to":"status-2","statusName":"In Progress"}',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Activity;
}

describe('DetailActivity', () => {
  it('renders the human status name for move events, not the raw status id', () => {
    render(<DetailActivity activity={[makeActivity({})]} formatTimestamp={() => 'Jan 1'} />);

    expect(screen.getByText('→ In Progress')).toBeInTheDocument();
    expect(screen.queryByText(/status-2/)).not.toBeInTheDocument();
  });

  it('falls back to statusName when a move event only carries the name (legacy MCP rows)', () => {
    render(
      <DetailActivity
        activity={[makeActivity({ detail: '{"to":"In Progress"}' })]}
        formatTimestamp={() => 'Jan 1'}
      />,
    );

    expect(screen.getByText('→ In Progress')).toBeInTheDocument();
  });

  it('renders change lists for update events', () => {
    render(
      <DetailActivity
        activity={[
          makeActivity({ action: 'updated', detail: '{"changes":["title: \\"A\\" → \\"B\\""]}' }),
        ]}
        formatTimestamp={() => 'Jan 1'}
      />,
    );

    expect(screen.getByText('— title: "A" → "B"')).toBeInTheDocument();
  });
});
