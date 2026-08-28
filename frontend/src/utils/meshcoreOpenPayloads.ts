/**
 * Parsing for rich-chat payloads sent by MeshCore Open clients as ordinary
 * plaintext mesh messages.
 *
 * MeshCore Open encodes some rich features into the message body with a short
 * prefix. RemoteTerm recognizes two of them for display:
 *
 *   g:<gifId>        Giphy GIF        -> https://media.giphy.com/media/<id>/giphy.gif
 *   r:<hash>:<index> Emoji reaction   -> <index> picks an emoji from a fixed list
 *
 * Formats and the emoji table are ported verbatim from meshcore-open:
 *   lib/helpers/gif_helper.dart
 *   lib/helpers/reaction_helper.dart
 *   lib/widgets/emoji_picker.dart
 * (github.com/zjs81/meshcore-open, dev branch).
 *
 * Reactions target a message by <hash>, a 4-hex-char (16-bit) truncation of
 * Dart's `String.hashCode` over `<senderTimestamp><senderName?><first 5 chars
 * of the target's body>` (reaction_helper.dart computeReactionHash). Unlike
 * MeshCore One's SHA-256-based hash, this is not a portable, spec'd
 * algorithm — it's the Dart VM's internal string hash. See
 * dartStringHashCode below for what makes this reliable enough to port, and
 * MessageList.tsx for how a resolved hash is matched to a target message
 * (nearest-preceding, since 16 bits collides far more readily than MeshCore
 * One's 40-bit hash). Sending in this format is out of scope (see
 * meshcoreOnePayloads.ts's module docs for why); we only resolve incoming
 * reactions.
 */

// --- Emoji table (order must match meshcore-open exactly for index compat) ---
// Also reused (not order-sensitive there) as the category source for the
// compose-box emoji picker — see components/EmojiPicker.tsx.

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👏', '🔥'];

// prettier-ignore
export const SMILEYS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
  '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖',
  '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
  '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
  '🤭', '🤫', '🤥', '😶',
];

// prettier-ignore
export const GESTURES = [
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
  '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚',
  '🖐️', '✋', '🖖', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
  '💅', '🤳', '💪',
];

// prettier-ignore
export const HEARTS = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
  '💌', '💢', '💥', '💫', '💦', '💨', '🕳️', '💬', '👁️‍🗨️', '🗨️',
  '🗯️', '💭',
];

// prettier-ignore
export const OBJECTS = [
  '🎉', '🎊', '🎈', '🎁', '🎀', '🪅', '🪆', '🏆', '🥇', '🥈',
  '🥉', '⚽', '⚾', '🥎', '🏀', '🏐', '🏈', '🏉', '🎾', '🥏',
  '🎳', '🏏', '🏑', '🏒', '🥍', '🏓', '🏸', '🥊', '🥋', '🥅',
  '⛳', '🔥', '⭐', '🌟', '✨', '⚡', '💡', '🔦', '🏮', '🪔',
  '📱', '💻', '⌚', '📷', '📺', '📻', '🎵', '🎶', '🚀',
];

/** Combined reaction emoji list, in the fixed index order used on the wire. */
export const REACTION_EMOJIS: readonly string[] = [
  ...QUICK_EMOJIS,
  ...SMILEYS,
  ...GESTURES,
  ...HEARTS,
  ...OBJECTS,
];

// --- GIF (g:<gifId>) ---

const GIF_PATTERN = /^g:([A-Za-z0-9_-]+)$/;

/**
 * Parse a MeshCore Open GIF payload. Returns the Giphy GIF id, or null if the
 * (trimmed) text is not a `g:<id>` payload.
 */
export function parseGif(text: string): string | null {
  const match = GIF_PATTERN.exec(text.trim());
  return match ? match[1] : null;
}

/** Build the Giphy media URL for a GIF id. */
export function giphyUrlForId(gifId: string): string {
  return `https://media.giphy.com/media/${gifId}/giphy.gif`;
}

// --- Reaction (r:<hash>:<index>) ---

const REACTION_PATTERN = /^r:([0-9a-f]{4}):([0-9a-f]{2})$/;

export interface ParsedReaction {
  /** The decoded reaction emoji. */
  emoji: string;
  /** 4-hex hash identifying the target message (not resolved here — see computeOpenReactionHash / MessageList.tsx). */
  targetHash: string;
}

/**
 * Parse a MeshCore Open reaction payload. Returns the decoded emoji and the
 * target-message hash (still needing to be matched against a candidate
 * message's own computeOpenReactionHash), or null if the (trimmed) text is
 * not a valid `r:<hash>:<index>` payload or the index is out of range.
 */
export function parseReaction(text: string): ParsedReaction | null {
  const match = REACTION_PATTERN.exec(text.trim());
  if (!match) return null;
  const index = parseInt(match[2], 16);
  if (!Number.isInteger(index) || index < 0 || index >= REACTION_EMOJIS.length) {
    return null;
  }
  return { emoji: REACTION_EMOJIS[index], targetHash: match[1] };
}

// --- Reaction target hash (Dart VM String.hashCode port) ---

/**
 * Port of the Dart VM's (AOT/JIT) `String.hashCode` — NOT dart2js's, which
 * masks intermediate values to 29 bits every iteration instead of only at
 * the end, and disagrees with the VM on the low 16 bits for the vast
 * majority of inputs. MeshCore Open ships as a Flutter mobile app (Dart VM),
 * so the VM variant is what we need.
 *
 * Ported from the Dart SDK (github.com/dart-lang/sdk):
 *   runtime/vm/hash.h        CombineHashes / FinalizeHash
 *   runtime/vm/object.h      StringHasher (feeds one UTF-16 code unit at a time)
 * The algorithm is a fixed constant-seed hash (no per-process/per-isolate
 * randomization) and has been unchanged since 2018, so it's stable to port.
 * Verified bit-for-bit against a real `dart` run (Dart SDK 3.13.2) for a set
 * of representative inputs — see meshcoreOpenPayloads.test.ts.
 */
export function dartStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    // UTF-16 code units, same as Dart's StringHasher — this means an astral
    // character (e.g. an emoji) contributes two separate surrogate code
    // units, matching Dart's String iteration exactly.
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + ((h << 10) >>> 0)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + ((h << 3) >>> 0)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + ((h << 15) >>> 0)) >>> 0;
  h &= 0x3fffffff; // kHashBits = 30
  return h === 0 ? 1 : h; // Dart coerces a zero hash to 1
}

/**
 * Compute a MeshCore Open reaction target hash: the low 16 bits of
 * dartStringHashCode over `<senderTimestamp><senderName?><first 5 chars of
 * the target message's body>`, as 4 lowercase hex chars. `senderName` is
 * omitted for DMs (implicit sender), included for channel/group messages.
 * `senderTimestamp`/`text` must be the *target* message's own sender
 * timestamp and body — the same inputs a receiver hashes to resolve this
 * reaction (see reaction_helper.dart computeReactionHash).
 *
 * `text.slice(0, 5)` deliberately indexes UTF-16 code units, matching Dart's
 * `String.substring` — including splitting a surrogate pair if the target
 * body starts with an astral character (e.g. an emoji) at that boundary. Do
 * not "fix" this with code-point-aware slicing; it would stop matching
 * meshcore-open's own hash.
 */
export function computeOpenReactionHash(
  senderTimestamp: number,
  senderName: string | null,
  text: string
): string {
  const first5 = text.length >= 5 ? text.substring(0, 5) : text;
  const input =
    senderName !== null
      ? `${senderTimestamp}${senderName}${first5}`
      : `${senderTimestamp}${first5}`;
  const hash = dartStringHashCode(input) & 0xffff;
  return hash.toString(16).padStart(4, '0');
}

// --- Reply-mention prefix (@[senderName] <payload>) ---

// meshcore-open prefixes replies with "@[senderName] " before the message body
// (see meshcore-open channels.md / BLE_PROTOCOL.md). Its own display code strips
// that prefix before parsing rich payloads, so a GIF/reaction reply arrives on
// the wire as "@[Name] g:<id>". parseGif/parseReaction stay strict (whole-body
// only); this splits the reply prefix off so the remainder can be parsed.
const REPLY_MENTION_PREFIX = /^(@\[[^\]]+\])\s+([\s\S]+)$/;

export interface SplitReplyMention {
  /** The leading "@[Name]" reply-mention token. */
  mention: string;
  /** The message remainder after the reply-mention prefix. */
  body: string;
}

/**
 * Split a leading meshcore-open reply mention ("@[Name] ") off the text, or
 * return null when there is no such prefix.
 */
export function splitReplyMention(text: string): SplitReplyMention | null {
  const match = REPLY_MENTION_PREFIX.exec(text.trim());
  if (!match) return null;
  return { mention: match[1], body: match[2] };
}
