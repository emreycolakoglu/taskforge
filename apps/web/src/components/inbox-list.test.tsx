import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InboxList } from './inbox-list';
import type { Notification } from '@/types';

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'n1',
    userId: 'u1',
    taskId: 't1',
    activityId: 'a1',
    action: 'commented',
    summary: 'Alice commented on TFG-1 "Title"',
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Notification;
}

describe('InboxList', () => {
  const base = {
    selectedId: null,
    onSelect: () => {},
    onMarkAllRead: () => {},
  };

  it('renders the @ icon for mention notifications', () => {
    const { container } = render(
      <InboxList
        {...base}
        notifications={[
          makeNotification({
            action: 'mentioned',
            summary: '@Emre mentioned you in TFG-1 "Title"',
          }),
        ]}
      />,
    );
    expect(container.querySelector('.lucide-at-sign')).not.toBeNull();
  });

  it('keeps the letter avatar for other notifications', () => {
    const { container } = render(<InboxList notifications={[makeNotification({})]} {...base} />);
    expect(container.querySelector('.lucide-at-sign')).toBeNull();
    expect(container.textContent).toContain('A');
  });
});
