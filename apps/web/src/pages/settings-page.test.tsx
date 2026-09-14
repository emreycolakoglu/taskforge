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
  useUsers: vi.fn(),
  useInvites: vi.fn(),
  useCreateInvite: vi.fn(),
  useRevokeInvite: vi.fn(),
  useDeleteUser: vi.fn(),
  useUserDirectory: vi.fn(),
}));
vi.mock('@/hooks/use-settings', () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
  useSendTestEmail: vi.fn(),
}));

import { useSettings, useUpdateSettings, useSendTestEmail } from '@/hooks/use-settings';
import {
  useUsers,
  useInvites,
  useCreateInvite,
  useRevokeInvite,
  useDeleteUser,
} from '@/hooks/use-users';

const mockUseSettings = vi.mocked(useSettings);
const mockUseUpdateSettings = vi.mocked(useUpdateSettings);
const mockUseSendTestEmail = vi.mocked(useSendTestEmail);
const mockUseUsers = vi.mocked(useUsers);
const mockUseInvites = vi.mocked(useInvites);
const mockUseCreateInvite = vi.mocked(useCreateInvite);
const mockUseRevokeInvite = vi.mocked(useRevokeInvite);
const mockUseDeleteUser = vi.mocked(useDeleteUser);

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

describe('SettingsPage Invites tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
    } as never);
    mockUseUpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    mockUseSendTestEmail.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    mockUseUsers.mockReturnValue({ data: [], isLoading: false } as never);
    mockUseInvites.mockReturnValue({ data: [], isLoading: false } as never);
    mockUseCreateInvite.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'i1', token: 'tok1234567890' }),
      isPending: false,
    } as never);
    mockUseRevokeInvite.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    mockUseDeleteUser.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });

  it('shows recipient email column', async () => {
    mockUseInvites.mockReturnValue({
      data: [
        {
          id: 'i1',
          token: 'tok1234567890',
          createdBy: 'u1',
          creatorName: 'A',
          usedBy: null,
          usedAt: null,
          recipientEmail: 'x@y.dev',
          expiresAt: '2027-01-01',
          createdAt: '2026-09-14',
          isExpired: false,
          isUsed: false,
        },
      ],
      isLoading: false,
    } as never);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Invites' }));
    expect(screen.getByText('x@y.dev')).toBeInTheDocument();
  });

  it('passes trimmed email to createInvite and shows emailed toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'i1', token: 'tok1234567890' });
    mockUseCreateInvite.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Invites' }));
    await userEvent.type(screen.getByLabelText('Invite recipient email'), '  x@y.dev  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create Invite' }));
    expect(mutateAsync).toHaveBeenCalledWith('x@y.dev');
    expect(screen.getByLabelText('Invite recipient email')).toHaveValue('');
  });
});
