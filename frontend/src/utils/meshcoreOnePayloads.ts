/**
 * Parsing for MeshCore One's rich-chat wire formats, sent as ordinary
 * plaintext mesh messages (github.com/Avi0n/MeshCoreOne — a different app
 * from meshcore-open, with its own incompatible reaction encoding; see
 * zjs81/meshcore-open#452).
 *
 * Reactions target a message by a hash of its content, so any node that
 * received the original message can independently compute the same hash and
 * resolve which message a reaction is for — see
 * github.com/Avi0n/MeshCoreOne/blob/main/docs/Reactions.md, and
 * MC1Services/Sources/MC1Services/Services/ReactionParser.swift for the
 * canonical parsing algorithm this file ports.
 *
 *   {emoji}@[{targetSenderName}]\n{hash}   Channel reaction
 *   {emoji}\n{hash}                        DM reaction (sender is implicit)
 *
 * hash = first 5 bytes of SHA-256(UTF-8(text) + little-endian UInt32(senderTimestamp)),
 * encoded as 8-char Crockford Base32 (excludes I, L, O, U to avoid ambiguity).
 *
 * MeshCore One also sends replies with a quoted preview:
 *
 *   @[{mentionName}]\n>{first ~10 chars of quoted message}[..]\n{reply body}
 *
 * (MentionUtilities.swift, buildReplyText). Unlike reactions, replies already
 * degrade gracefully as plain readable text (the mention still renders), so
 * parsing this is purely a display upgrade, not a correctness fix.
 */

import CryptoJS from 'crypto-js';

// --- Crockford Base32 ---

const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Encode 5 raw bytes (40 bits) as 8 lowercase Crockford Base32 characters. */
function crockfordEncode(bytes: Uint8Array): string {
  let bits = 0n;
  for (const b of bytes) {
    bits = (bits << 8n) | BigInt(b);
  }
  let out = '';
  for (let shift = 35; shift >= 0; shift -= 5) {
    out += CROCKFORD_ALPHABET[Number((bits >> BigInt(shift)) & 0x1fn)];
  }
  return out;
}

/**
 * Normalize an 8-char Crockford Base32 string to its canonical lowercase
 * form, applying the standard substitutions (O -> 0, I/L -> 1). Returns null
 * if any character isn't a valid Crockford Base32 character (notably 'U').
 */
function crockfordNormalize(raw: string): string | null {
  let out = '';
  for (const ch of raw) {
    const lower = ch.toLowerCase();
    const mapped = lower === 'o' ? '0' : lower === 'i' || lower === 'l' ? '1' : lower;
    if (!CROCKFORD_ALPHABET.includes(mapped)) return null;
    out += mapped;
  }
  return out;
}

/** Extract the raw bytes from a CryptoJS WordArray. */
function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wordArray;
  const bytes = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

/**
 * Compute a MeshCore One reaction target hash for a message: first 5 bytes of
 * SHA-256(UTF-8(text) + little-endian UInt32(senderTimestamp)), as 8-char
 * lowercase Crockford Base32. `senderTimestamp` must be the message's
 * original sender timestamp (seconds), not local receive time, or nodes
 * won't agree on the hash.
 */
export function computeReactionHash(text: string, senderTimestamp: number): string {
  const textBytes = CryptoJS.enc.Utf8.parse(text);
  const ts = senderTimestamp >>> 0;
  // Pack the little-endian 4 bytes of `ts` into one big-endian WordArray word.
  const tsWord = ((ts & 0xff) << 24) | ((ts & 0xff00) << 8) | ((ts >>> 8) & 0xff00) | (ts >>> 24);
  const tsWords = CryptoJS.lib.WordArray.create([tsWord], 4);
  const digest = CryptoJS.SHA256(textBytes.concat(tsWords));
  return crockfordEncode(wordArrayToBytes(digest).slice(0, 5));
}

// --- Emoji detection ---

// Matches a codepoint that's plausibly the start of an emoji, without also
// matching plain digits/punctuation that Unicode's broader \p{Emoji}
// property would (those are only emoji as part of keycap sequences).
const LOOKS_LIKE_EMOJI = /\p{Extended_Pictographic}/u;

/** True if `s` is non-empty and its first *code point* (not UTF-16 unit — a
 * surrogate pair like 👍 would otherwise split) looks like an emoji. */
function startsWithEmoji(s: string): boolean {
  const firstCodePoint = s.codePointAt(0);
  if (firstCodePoint === undefined) return false;
  return LOOKS_LIKE_EMOJI.test(String.fromCodePoint(firstCodePoint));
}

// --- Reactions ---

export interface ParsedMeshcoreOneReaction {
  /** The reaction emoji (may be a multi-codepoint grapheme, e.g. with a ZWJ or skin tone). */
  emoji: string;
  /** Target sender's display name, for channel reactions; null for DM reactions. */
  targetSenderName: string | null;
  /** Normalized (lowercase) 8-char Crockford Base32 target-message hash. */
  hash: string;
}

/**
 * Parse a MeshCore One *channel* reaction: `{emoji}@[{targetSenderName}]\n{hash}`.
 * Ports ReactionParser.parse's end-to-start strategy: split on the last
 * newline for the hash, then require an "@[...]" sender in what's left.
 * Returns null if the text isn't a valid channel reaction.
 */
export function parseMeshcoreOneChannelReaction(text: string): ParsedMeshcoreOneReaction | null {
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) return null;

  const rawHash = text.slice(lastNewline + 1);
  if (rawHash.length !== 8) return null;
  const hash = crockfordNormalize(rawHash);
  if (hash === null) return null;

  const beforeHash = text.slice(0, lastNewline);
  const atBracket = beforeHash.indexOf('@[');
  if (atBracket === -1) return null;

  const emoji = beforeHash.slice(0, atBracket);
  if (!startsWithEmoji(emoji)) return null;
  const afterBracket = beforeHash.slice(atBracket + 2);
  if (!afterBracket.endsWith(']')) return null;
  const targetSenderName = afterBracket.slice(0, -1);
  if (!targetSenderName) return null;
  return { emoji, targetSenderName, hash };
}

/**
 * Parse a MeshCore One *DM* reaction: `{emoji}\n{hash}` (sender is implicit
 * in a two-party conversation). Ports ReactionParser.parseDM, including its
 * explicit rejection of anything containing "@[" — a bare "@Name" with no
 * brackets is a channel-shaped edge case this format doesn't claim, matching
 * upstream's `Returns nil for missing brackets around sender` behavior for
 * the channel parser (channel and DM reactions are only ever distinguished
 * by which parser the caller picks for a given conversation, never inferred
 * from the text alone — see ReactionParser.isReactionText).
 */
export function parseMeshcoreOneDMReaction(
  text: string
): Omit<ParsedMeshcoreOneReaction, 'targetSenderName'> | null {
  if (text.includes('@[')) return null;

  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) return null;

  const rawHash = text.slice(lastNewline + 1);
  if (rawHash.length !== 8) return null;
  const hash = crockfordNormalize(rawHash);
  if (hash === null) return null;

  const emoji = text.slice(0, lastNewline);
  if (!startsWithEmoji(emoji)) return null;
  return { emoji, hash };
}

/**
 * Parse a MeshCore One reaction, picking the channel or DM wire shape based
 * on the conversation the message arrived on. Returns null if the text isn't
 * a valid reaction for that conversation type.
 */
export function parseMeshcoreOneReaction(
  text: string,
  isDM: boolean
): ParsedMeshcoreOneReaction | null {
  if (isDM) {
    const dm = parseMeshcoreOneDMReaction(text);
    return dm ? { ...dm, targetSenderName: null } : null;
  }
  return parseMeshcoreOneChannelReaction(text);
}

// --- Replies ---

export interface ParsedMeshcoreOneReply {
  /** The name from the leading "@[Name]" mention. */
  mentionName: string;
  /** The quoted-preview line verbatim (already includes a trailing ".." if MeshCore One truncated it). */
  quotePreview: string;
  /** The actual reply text, which may itself span multiple lines. */
  body: string;
}

const REPLY_PATTERN = /^@\[([^\]]+)\]\n>([^\n]*)\n([\s\S]*)$/;

/**
 * Parse a MeshCore One reply-with-quote payload (see module docs). Returns
 * null if the text doesn't start with the "@[Name]\n>preview\n" header.
 */
export function parseMeshcoreOneReply(text: string): ParsedMeshcoreOneReply | null {
  const match = REPLY_PATTERN.exec(text);
  if (!match) return null;
  const [, mentionName, quotePreview, body] = match;
  return { mentionName, quotePreview, body };
}

/**
 * Build the wire text for a reaction to a message, in MeshCore One's format.
 * `targetSenderName` should be the channel-wire sender name of the message
 * being reacted to (parsed the same way as any other channel message), or
 * null for a DM. `targetText`/`targetTimestamp` must be that message's body
 * (with any "SenderName: " prefix already stripped) and original sender
 * timestamp — the same inputs a receiver will hash to resolve this reaction.
 *
 * This is the format we send in (not meshcore-open's) because its hash is a
 * standard, verifiable SHA-256 truncation we can correctly reproduce; see the
 * module docs for why meshcore-open's own format can't be reliably emitted.
 */
export function buildMeshcoreOneReactionText(
  emoji: string,
  targetSenderName: string | null,
  targetText: string,
  targetTimestamp: number
): string {
  const hash = computeReactionHash(targetText, targetTimestamp);
  return targetSenderName ? `${emoji}@[${targetSenderName}]\n${hash}` : `${emoji}\n${hash}`;
}
