import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RawPacketDetailModal } from '../components/RawPacketDetailModal';
import type { Channel, CoreScopeAnalysis, RawPacket } from '../types';

vi.mock('../components/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('../api', () => ({
  api: {
    getPacketCoreScopeAnalysis: vi.fn(),
  },
}));

const { toast } = await import('../components/ui/sonner');
const { api } = await import('../api');
const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
};
const mockGetCoreScope = api.getPacketCoreScopeAnalysis as unknown as ReturnType<typeof vi.fn>;

const BOT_CHANNEL: Channel = {
  key: 'eb50a1bcb3e4e5d7bf69a57c9dada211',
  name: '#bot',
  is_hashtag: true,
  on_radio: false,
  last_read_at: null,
  favorite: false,
  muted: false,
};

const BOT_PACKET: RawPacket = {
  id: 1,
  observation_id: 10,
  timestamp: 1_700_000_000,
  data: '15833fa002860ccae0eed9ca78b9ab0775d477c1f6490a398bf4edc75240',
  decrypted: false,
  payload_type: 'GroupText',
  rssi: -72,
  snr: 5.5,
  decrypted_info: null,
};

// TransportFlood ACK: header 0C (route=0 TransportFlood, type=3 ACK, ver=0),
// transport codes 3412 7856 (LE: 0x1234, 0x5678), path_len 00, ACK checksum AABBCCDD
const SCOPED_PACKET: RawPacket = {
  id: 2,
  timestamp: 1_700_000_000,
  data: '0C3412785600AABBCCDD',
  decrypted: false,
  payload_type: 'Ack',
  rssi: -80,
  snr: 3.0,
  decrypted_info: null,
};

describe('RawPacketDetailModal', () => {
  beforeEach(() => {
    mockGetCoreScope.mockReset();
    mockGetCoreScope.mockResolvedValue({
      found: false,
      packet_hash: '0000000000000000',
      observation_count: 0,
      resolved_path: [],
      observers: [],
      source: 'https://ntxmesh.dhovin.me',
    } satisfies CoreScopeAnalysis);
  });

  it('fetches the CoreScope "who heard this" lookup automatically, with no button click needed', async () => {
    const result: CoreScopeAnalysis = {
      found: true,
      packet_hash: 'ABCD1234',
      observation_count: 2,
      resolved_path: ['aa', 'bb'],
      observers: [
        { observer_name: 'anclote', rssi: -70, snr: 5.25, path_hex: '["4284"]', heard_at: '2026-09-27T00:00:00Z' },
      ],
      source: 'https://ntxmesh.dhovin.me',
    };
    mockGetCoreScope.mockResolvedValueOnce(result);

    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    expect(mockGetCoreScope).toHaveBeenCalledWith(BOT_PACKET.id);
    await waitFor(() => expect(screen.getByText('anclote')).toBeInTheDocument());
    expect(screen.getByText(/Heard by/)).toHaveTextContent('Heard by 2 independent observers');
  });

  it('renders a partial hop count when CoreScope could not resolve every hop', async () => {
    mockGetCoreScope.mockResolvedValueOnce({
      found: true,
      packet_hash: 'A0E8BC8B1D0DF128',
      observation_count: 1,
      resolved_path: ['aa', null, 'cc'],
      observers: [
        { observer_name: 'WC-obs-bot', rssi: -66, snr: 12.25, path_hex: '["A97A"]', heard_at: '2026-09-27T18:46:07Z' },
      ],
      source: 'https://ntxmesh.dhovin.me',
    } satisfies CoreScopeAnalysis);

    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('WC-obs-bot')).toBeInTheDocument());
    expect(screen.getByText(/Heard by/)).toHaveTextContent('2 of 3 hops resolved');
  });

  it('color-codes observer RSSI as strong/okay/weak, matching the raw-packet-feed thresholds', async () => {
    mockGetCoreScope.mockResolvedValueOnce({
      found: true,
      packet_hash: 'ABCD1234',
      observation_count: 3,
      resolved_path: [],
      observers: [
        { observer_name: 'strong-obs', rssi: -60, snr: 12, path_hex: null, heard_at: null },
        { observer_name: 'okay-obs', rssi: -80, snr: 8, path_hex: null, heard_at: null },
        { observer_name: 'weak-obs', rssi: -95, snr: -2, path_hex: null, heard_at: null },
      ],
      source: 'https://ntxmesh.dhovin.me',
    } satisfies CoreScopeAnalysis);

    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('RSSI -60 dBm')).toBeInTheDocument());
    expect(screen.getByText('RSSI -60 dBm')).toHaveClass('text-success');
    expect(screen.getByText('RSSI -80 dBm')).toHaveClass('text-warning');
    expect(screen.getByText('RSSI -95 dBm')).toHaveClass('text-destructive');
  });

  it('copies the full packet hex to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(BOT_PACKET.data);
    expect(mockToast.success).toHaveBeenCalledWith('Packet hex copied!');
  });

  it('renders path hops as nowrap arrow-delimited groups and links hover state to the full packet hex', () => {
    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    const pathDescription = screen.getByText(
      'Historical route taken (3-byte hashes added as packet floods through network)'
    );
    const pathFieldBox = pathDescription.closest('[class*="rounded-lg"]');
    expect(pathFieldBox).not.toBeNull();

    const pathField = within(pathFieldBox as HTMLElement);
    expect(pathField.getByText('3FA002 →')).toHaveClass('whitespace-nowrap');
    expect(pathField.getByText('860CCA →')).toHaveClass('whitespace-nowrap');
    expect(pathField.getByText('E0EED9')).toHaveClass('whitespace-nowrap');

    const pathRun = screen.getByText('3F A0 02 86 0C CA E0 EE D9');
    const idleClassName = pathRun.className;

    fireEvent.mouseEnter(pathFieldBox as HTMLElement);
    expect(pathRun.className).not.toBe(idleClassName);

    fireEvent.mouseLeave(pathFieldBox as HTMLElement);
    expect(pathRun.className).toBe(idleClassName);
  });

  it('shows scope card with transport codes for scoped packets without a resolved region', () => {
    render(<RawPacketDetailModal packet={SCOPED_PACKET} channels={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Regional')).toBeInTheDocument();
    expect(screen.getByText('0x1234, 0x5678 · unknown region')).toBeInTheDocument();
  });

  it('shows the resolved region name in the scope card when the backend matched one', () => {
    render(
      <RawPacketDetailModal
        packet={{ ...SCOPED_PACKET, region: 'nl-gr', transport_code: 0x1234 }}
        channels={[]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('nl-gr')).toBeInTheDocument();
    // Raw codes remain visible as the secondary detail.
    expect(screen.getByText('0x1234, 0x5678')).toBeInTheDocument();
  });

  it('does not show scope card for non-transport packets', () => {
    render(<RawPacketDetailModal packet={BOT_PACKET} channels={[BOT_CHANNEL]} onClose={vi.fn()} />);

    expect(screen.queryByText('Scope')).not.toBeInTheDocument();
  });
});
