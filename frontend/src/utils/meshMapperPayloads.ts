/**
 * Parsing for MeshMapper wardriving "wire tags" sent as ordinary plaintext
 * mesh messages, typically on a `#wardriving` channel.
 *
 * MeshMapper (github.com/MeshMapper/MeshMapper_Flutter_App) replaces
 * plaintext GPS coordinates with a keyed, encrypted tag by default:
 *
 *   MM:<10-char base64url>            Privacy mode: an opaque wire tag
 *   MM:<10-char base64url>:<lat>,<lon> "Broadcast My Coordinates" mode
 *
 * The 10-char body decodes to a 7-byte Feistel-ciphertext (region + date +
 * session# + ping counter) keyed by a secret from MeshMapper's own `/auth`
 * backend — see `lib/services/meshcore/wire_tag_codec.dart` in that repo.
 * RemoteTerm does NOT attempt to decrypt it: doing so without the shared
 * secret isn't possible, and the encryption exists specifically so other
 * mesh listeners can't extract a wardriver's session from the tag alone.
 * We only recognize the shape well enough to display it as a wardrive ping
 * instead of raw base64 noise, and to surface the coordinates when the
 * sender opted to broadcast them in the clear.
 */

const WIRE_TAG_PATTERN = /^MM:([A-Za-z0-9_-]{10})(?::(-?\d+\.\d+),(-?\d+\.\d+))?$/;

export interface ParsedWireTag {
  /** The opaque 10-char base64url tag body (not decodable without the shared secret). */
  tag: string;
  /** Plaintext latitude, present only when the sender broadcast their coordinates. */
  lat: number | null;
  /** Plaintext longitude, present only when the sender broadcast their coordinates. */
  lon: number | null;
}

/**
 * Parse a MeshMapper wire-tag payload. Returns the tag and (if present) the
 * broadcast coordinates, or null if the (trimmed) text is not a valid
 * `MM:<tag>` or `MM:<tag>:<lat>,<lon>` payload.
 */
export function parseWireTag(text: string): ParsedWireTag | null {
  const match = WIRE_TAG_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, tag, lat, lon] = match;
  return {
    tag,
    lat: lat !== undefined ? Number(lat) : null,
    lon: lon !== undefined ? Number(lon) : null,
  };
}

/** Build an OpenStreetMap link for a broadcast coordinate pair. */
export function osmUrlForCoords(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}
