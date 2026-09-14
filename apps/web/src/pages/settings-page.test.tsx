import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './settings-page';

const mockSettings = {
  id: 'singleton',
  title: 'TF',
  onboarded: true,
  smtpHost: 'smtp.test',
  smtpPort: 465,
  smtpUsername: 'user',
  smtpPasswordSet: true,
  smtpFromEmail: 'from@tf.dev',
  smtpFromName: 'TF Mailer',
  smtpSecure: true,
  createdAt: null,
  updatedAt: null,
};

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', role: 'admin', displayName: 'Admin', email: 'admin@tf.dev' },
  }),
}));
vi.mock('@/hooks/use-users', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useInvites: () => ({ data: [], isLoading: false }),
  useCreateInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeInvite: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUserDirectory: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-settings', () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
  useSendTestEmail: vi.fn(),
}));

import { useSettings, useUpdateSettings, useSendTestEmail } from '@/hooks/use-settings';

const mockUseSettings = vi.mocked(useSettings);
const mockUseUpdateSettings = vi.mocked(useUpdateSettings);
const mockUseSendTestEmail = vi.mocked(useSendTestEmail);

describe('SettingsPage Email tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
    } as never);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    mockUseSendTestEmail.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });

  it('renders SMTP fields populated from settings', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
    expect(screen.getByLabelText('SMTP Host')).toHaveValue('smtp.test');
    expect(screen.getByLabelText('From Email')).toHaveValue('from@tf.dev');
    expect(screen.getByPlaceholderText('••••••')).toBeInTheDocument();
  });

  it('saves SMTP config via update', async () => {
    const mutate = vi.fn();
    mockUseUpdateSettings.mockReturnValue({ mutate, isPending: false } as never);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
    await userEvent.type(screen.getByLabelText('SMTP Host'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpHost: 'smtp.testx',
        smtpPort: 465,
        smtpUsername: 'user',
        smtpFromEmail: 'from@tf.dev',
        smtpFromName: 'TF Mailer',
        smtpSecure: true,
      }),
    );
  });

  it('omits smtpPassword from the payload when left blank', async () => {
    const mutate = vi.fn();
    mockUseUpdateSettings.mockReturnValue({ mutate, isPending: false } as never);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const payload = mutate.mock.calls[0][0];
    expect('smtpPassword' in payload).toBe(false);
  });
});
