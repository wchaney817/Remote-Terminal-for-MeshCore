/**
 * Tests for NewMessageModal form state reset.
 *
 * Verifies that form fields are cleared when the modal closes (via Create,
 * Cancel, or Dialog dismiss) and when switching tabs.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NewMessageModal } from '../components/NewMessageModal';
import { toast } from '../components/ui/sonner';

// Mock sonner (toast)
vi.mock('../components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

describe('NewMessageModal form reset', () => {
  const onClose = vi.fn();
  const onCreateContact = vi.fn().mockResolvedValue(undefined);
  const onCreateChannel = vi.fn().mockResolvedValue(undefined);
  const onCreateHashtagChannel = vi.fn().mockResolvedValue(undefined);
  const onBulkAddHashtagChannels = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(
    open = true,
    overrides: Partial<Parameters<typeof NewMessageModal>[0]> = {}
  ) {
    return render(
      <NewMessageModal
        open={open}
        undecryptedCount={5}
        onClose={onClose}
        onCreateContact={onCreateContact}
        onCreateChannel={onCreateChannel}
        onCreateHashtagChannel={onCreateHashtagChannel}
        onBulkAddHashtagChannels={onBulkAddHashtagChannels}
        {...overrides}
      />
    );
  }

  async function switchToTab(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole('tab', { name }));
  }

  describe('hashtag tab', () => {
    it('prefills the hashtag tab from a linked channel request', async () => {
      renderModal(true, {
        prefillRequest: {
          tab: 'hashtag',
          hashtagName: 'mesh-room',
          nonce: 1,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Hashtag Channel' })).toHaveAttribute(
          'data-state',
          'active'
        );
      });
      expect((screen.getByPlaceholderText('channel-name') as HTMLInputElement).value).toBe(
        'mesh-room'
      );
    });

    it('clears name after successful Create', async () => {
      const user = userEvent.setup();
      const { unmount } = renderModal();
      await switchToTab(user, 'Hashtag Channel');

      const input = screen.getByPlaceholderText('channel-name') as HTMLInputElement;
      await user.type(input, 'testchan');
      expect(input.value).toBe('testchan');

      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateHashtagChannel).toHaveBeenCalledWith('#testchan', true);
      });
      expect(onClose).toHaveBeenCalled();
      unmount();

      // Re-render to simulate reopening — state should be reset
      renderModal();
      await switchToTab(user, 'Hashtag Channel');
      expect((screen.getByPlaceholderText('channel-name') as HTMLInputElement).value).toBe('');
    });

    it('clears name when Cancel is clicked', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Hashtag Channel');

      const input = screen.getByPlaceholderText('channel-name') as HTMLInputElement;
      await user.type(input, 'mychannel');
      expect(input.value).toBe('mychannel');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('rejects extended characters when the extended toggle is off', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Hashtag Channel');

      await user.type(screen.getByPlaceholderText('channel-name'), 'Cats&Dogs');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(onCreateHashtagChannel).not.toHaveBeenCalled();
      expect(
        screen.getByText('Use letters, numbers, and single dashes (no leading/trailing dashes)')
      ).toBeTruthy();
    });

    it('hashes the name verbatim when the extended toggle is on', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Hashtag Channel');

      await user.click(
        screen.getByRole('checkbox', {
          name: /Permit capitals, whitespace, and extended characters/,
        })
      );
      await user.type(screen.getByPlaceholderText('channel-name'), 'Cats&Dogs');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateHashtagChannel).toHaveBeenCalledWith('#Cats&Dogs', true);
      });
    });
  });

  describe('bulk hashtag tab', () => {
    it('is only visible when enabled', () => {
      renderModal();
      expect(screen.queryByRole('tab', { name: 'Bulk Add Channel' })).toBeNull();
    });

    it('opens on the bulk tab when enabled and submits normalized channel names', async () => {
      const user = userEvent.setup();
      renderModal(true, { showBulkAddChannelTab: true });

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Bulk Add Channel' })).toHaveAttribute(
          'data-state',
          'active'
        );
      });

      await user.type(
        screen.getByRole('textbox', { name: 'Bulk channel names' }),
        '#Ops{enter}mesh-room another-room #Ops'
      );
      await user.click(screen.getByRole('button', { name: 'Add Channels' }));

      await waitFor(() => {
        expect(onBulkAddHashtagChannels).toHaveBeenCalledWith(
          ['#ops', '#mesh-room', '#another-room'],
          true
        );
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('shows invalid bulk channel names before submitting', async () => {
      const user = userEvent.setup();
      renderModal(true, { showBulkAddChannelTab: true });

      await user.type(
        screen.getByRole('textbox', { name: 'Bulk channel names' }),
        'good-room bad_room'
      );
      await user.click(screen.getByRole('button', { name: 'Add Channels' }));

      expect(onBulkAddHashtagChannels).not.toHaveBeenCalled();
      expect(screen.getByText('Invalid channel names: bad_room')).toBeTruthy();
    });

    it('accepts extended names split by lines when the toggle is on', async () => {
      const user = userEvent.setup();
      renderModal(true, { showBulkAddChannelTab: true });

      await user.click(
        screen.getByRole('checkbox', {
          name: /Permit capitals, whitespace, and extended characters/,
        })
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Bulk channel names' }),
        '#Cats & Dogs{enter}Mesh Room'
      );
      await user.click(screen.getByRole('button', { name: 'Add Channels' }));

      await waitFor(() => {
        expect(onBulkAddHashtagChannels).toHaveBeenCalledWith(
          ['#Cats & Dogs', '#Mesh Room'],
          true
        );
      });
    });
  });

  describe('new-contact tab', () => {
    it('clears name and key after successful Create', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Contact');

      await user.type(screen.getByPlaceholderText('Contact name'), 'Bob');
      await user.type(screen.getByPlaceholderText('64-character hex public key'), 'bb'.repeat(32));

      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateContact).toHaveBeenCalledWith('Bob', 'bb'.repeat(32), false, 1);
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('new-channel tab', () => {
    it('clears name and key after successful Create', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Private Channel');

      await user.type(screen.getByPlaceholderText('Channel name'), 'MyRoom');
      await user.type(screen.getByPlaceholderText('Pre-shared key (hex)'), 'cc'.repeat(16));

      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateChannel).toHaveBeenCalledWith('MyRoom', 'cc'.repeat(16), true);
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('toasts when creation fails', async () => {
      const user = userEvent.setup();
      onCreateChannel.mockRejectedValueOnce(new Error('Bad key'));
      renderModal();
      await switchToTab(user, 'Private Channel');

      await user.type(screen.getByPlaceholderText('Channel name'), 'MyRoom');
      await user.type(screen.getByPlaceholderText('Pre-shared key (hex)'), 'cc'.repeat(16));
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to create conversation', {
          description: 'Bad key',
        });
      });
      expect(screen.getByText('Bad key')).toBeTruthy();
    });
  });

  describe('tab switching resets form', () => {
    it('clears contact fields when switching to channel tab', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Contact');

      await user.type(screen.getByPlaceholderText('Contact name'), 'Bob');
      await user.type(screen.getByPlaceholderText('64-character hex public key'), 'deadbeef');

      // Switch to Private Channel tab — fields should reset
      await switchToTab(user, 'Private Channel');

      expect((screen.getByPlaceholderText('Channel name') as HTMLInputElement).value).toBe('');
      expect((screen.getByPlaceholderText('Pre-shared key (hex)') as HTMLInputElement).value).toBe(
        ''
      );
    });

    it('clears channel fields when switching to hashtag tab', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Private Channel');

      await user.type(screen.getByPlaceholderText('Channel name'), 'SecretRoom');
      await user.type(screen.getByPlaceholderText('Pre-shared key (hex)'), 'ff'.repeat(16));

      await switchToTab(user, 'Hashtag Channel');

      expect((screen.getByPlaceholderText('channel-name') as HTMLInputElement).value).toBe('');
    });
  });

  describe('tryHistorical checkbox defaults', () => {
    it('is checked by default on channel tabs and unchecked on the contact tab', async () => {
      const user = userEvent.setup();
      renderModal();

      expect(screen.getByRole('checkbox', { name: /Try decrypting/ })).not.toBeChecked();
      for (const tab of ['Private Channel', 'Hashtag Channel']) {
        await switchToTab(user, tab);
        expect(screen.getByRole('checkbox', { name: /Try decrypting/ })).toBeChecked();
      }
    });

    it('restores the default when switching tabs', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Hashtag Channel');

      // Uncheck the default-on "Try decrypting" checkbox
      await user.click(screen.getByRole('checkbox', { name: /Try decrypting/ }));
      expect(screen.queryByText(/Messages will stream in/)).toBeNull();

      // Switch tab and come back
      await switchToTab(user, 'Contact');
      await switchToTab(user, 'Hashtag Channel');

      expect(screen.getByText(/Messages will stream in/)).toBeTruthy();
    });

    it('passes false when the user unchecks it', async () => {
      const user = userEvent.setup();
      renderModal();
      await switchToTab(user, 'Hashtag Channel');

      await user.click(screen.getByRole('checkbox', { name: /Try decrypting/ }));
      await user.type(screen.getByPlaceholderText('channel-name'), 'quiet');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateHashtagChannel).toHaveBeenCalledWith('#quiet', false);
      });
    });

    it('passes false when there are no stored packets to decrypt', async () => {
      const user = userEvent.setup();
      renderModal(true, { undecryptedCount: 0 });
      await switchToTab(user, 'Hashtag Channel');

      expect(screen.queryByRole('checkbox', { name: /Try decrypting/ })).toBeNull();
      await user.type(screen.getByPlaceholderText('channel-name'), 'empty');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(onCreateHashtagChannel).toHaveBeenCalledWith('#empty', false);
      });
    });
  });
});
