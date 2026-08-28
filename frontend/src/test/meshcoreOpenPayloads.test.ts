/**
 * Tests for MeshCore Open rich-chat payload parsing (GIFs and reactions).
 *
 * Formats are ported from meshcore-open; see meshcoreOpenPayloads.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  REACTION_EMOJIS,
  computeOpenReactionHash,
  dartStringHashCode,
  giphyUrlForId,
  parseGif,
  parseReaction,
  splitReplyMention,
} from '../utils/meshcoreOpenPayloads';

describe('parseGif', () => {
  it('parses a g:<id> payload', () => {
    expect(parseGif('g:abc123')).toBe('abc123');
  });

  it('accepts ids with underscores and dashes', () => {
    expect(parseGif('g:aB3_-xY')).toBe('aB3_-xY');
  });

  it('trims surrounding whitespace', () => {
    expect(parseGif('  g:abc123  ')).toBe('abc123');
  });

  it('returns null for non-gif text', () => {
    expect(parseGif('hello world')).toBeNull();
    expect(parseGif('g:')).toBeNull();
    expect(parseGif('g:abc 123')).toBeNull();
    expect(parseGif('prefix g:abc')).toBeNull();
    expect(parseGif('g:abc!')).toBeNull();
  });

  it('builds the Giphy media URL', () => {
    expect(giphyUrlForId('abc123')).toBe('https://media.giphy.com/media/abc123/giphy.gif');
  });
});

describe('parseReaction', () => {
  it('decodes the first emoji (index 00)', () => {
    const result = parseReaction('r:1a2b:00');
    expect(result).toEqual({ emoji: REACTION_EMOJIS[0], targetHash: '1a2b' });
    expect(result?.emoji).toBe('👍');
  });

  it('decodes a non-zero index', () => {
    // index 0x06 -> first smiley (after the 6 quick emojis)
    const result = parseReaction('r:ffff:06');
    expect(result?.emoji).toBe(REACTION_EMOJIS[6]);
    expect(result?.targetHash).toBe('ffff');
  });

  it('trims surrounding whitespace', () => {
    expect(parseReaction('  r:1a2b:00  ')?.emoji).toBe('👍');
  });

  it('returns null for an out-of-range index', () => {
    // 0xff (255) is beyond the emoji list length
    expect(parseReaction('r:1a2b:ff')).toBeNull();
  });

  it('returns null for malformed reactions', () => {
    expect(parseReaction('r:1a2b')).toBeNull();
    expect(parseReaction('r:1a2:00')).toBeNull(); // hash too short
    expect(parseReaction('r:1A2B:00')).toBeNull(); // uppercase hex not accepted
    expect(parseReaction('r:1a2b:0')).toBeNull(); // index too short
    expect(parseReaction('hello')).toBeNull();
  });

  it('exposes a stable, deduplication-free emoji index range', () => {
    // 6 quick + 64 smileys + 33 gestures + 32 hearts + 49 objects
    expect(REACTION_EMOJIS.length).toBe(184);
    // every defined index decodes to a string
    for (let i = 0; i < REACTION_EMOJIS.length; i++) {
      const hex = i.toString(16).padStart(2, '0');
      expect(parseReaction(`r:0000:${hex}`)?.emoji).toBe(REACTION_EMOJIS[i]);
    }
  });
});

describe('dartStringHashCode', () => {
  // Ground truth: run verbatim through the real Dart VM (Dart SDK 3.13.2,
  // macos_arm64, `dart run`), not just transcribed from SDK source — see
  // meshcoreOpenPayloads.ts module docs. Each case is the exact hash-input
  // string built the same way computeOpenReactionHash does.
  const VM_VECTORS: [string, number][] = [
    ['1704067200AliceHello', 84650593],
    ['1704067200Hello', 841519815],
    ['1704067200BobHi', 621533200],
    ['1735689600CharlieTesti', 207658985],
    ['1767225600Dave\u{1F44D} ni', 734808422],
    ['1704067200JoséBueno', 275786432],
    ['1704067200\u{1F600}ZoeEmoji', 1072229127],
    ['1704067200中文用户你好吗朋友', 888411591],
    ['0A', 17320921],
    // "👍👍👍".substring(0, 5) — the first 5 UTF-16 code units of 3 astral
    // emoji is 2 whole + 1 lone (unpaired) high surrogate.
    ['1704067200👍👍\uD83D', 761031559],
    ['1704067200VeryLongSenderNameHereabcde', 330418870],
    ['tsa', 138071234],
    ['tsab', 372019662],
    ['tsabc', 653884708],
    ['tsabcde', 990649002],
  ];

  it('matches the real Dart VM String.hashCode for representative inputs', () => {
    for (const [input, expected] of VM_VECTORS) {
      expect(dartStringHashCode(input)).toBe(expected);
    }
  });

  it('never returns 0 (Dart coerces a zero hash to 1)', () => {
    expect(dartStringHashCode('')).toBe(1);
  });

  it('is stable across repeated calls (no per-process randomization)', () => {
    expect(dartStringHashCode('abc')).toBe(dartStringHashCode('abc'));
    expect(dartStringHashCode('abc')).toBe(756227931);
  });
});

describe('computeOpenReactionHash', () => {
  it('matches the low 16 bits of the verified Dart VM vectors', () => {
    // "1704067200AliceHello" -> full hash 84650593 -> 0x050b_aa61 -> low16 aa61
    expect(computeOpenReactionHash(1704067200, 'Alice', 'Hello world')).toBe('aa61');
    // DM (no sender name): "1704067200Hello" -> 841519815 -> low16 92c7
    expect(computeOpenReactionHash(1704067200, null, 'Hello world')).toBe('92c7');
  });

  it('takes only the first 5 UTF-16 code units of the body', () => {
    // "Hello world" and "Hello!!!!!" share the first 5 code units "Hello".
    expect(computeOpenReactionHash(1704067200, 'Alice', 'Hello world')).toBe(
      computeOpenReactionHash(1704067200, 'Alice', 'Hello!!!!!')
    );
  });

  it('does not "fix" a surrogate pair split at the 5-code-unit boundary', () => {
    // "👍👍👍".substring(0, 5) in JS (matching Dart's String.substring)
    // yields 2 whole thumbs-up + a lone high surrogate.
    expect(computeOpenReactionHash(1704067200, null, '👍👍👍')).toBe('6b87');
  });

  it('returns 4 lowercase hex characters, zero-padded', () => {
    const hash = computeOpenReactionHash(0, 'A', '');
    expect(hash).toMatch(/^[0-9a-f]{4}$/);
  });
});

describe('splitReplyMention', () => {
  it('splits a reply-prefixed gif into mention + body (issue #291)', () => {
    // meshcore-open sends GIF replies as "@[senderName] g:<id>".
    expect(splitReplyMention('@[Alice] g:abc123')).toEqual({
      mention: '@[Alice]',
      body: 'g:abc123',
    });
  });

  it('the split body parses as a gif while the whole string does not', () => {
    const whole = '@[Alice] g:abc123';
    expect(parseGif(whole)).toBeNull(); // anchored regex rejects the prefix
    const split = splitReplyMention(whole);
    expect(split && parseGif(split.body)).toBe('abc123');
  });

  it('splits a reply-prefixed reaction', () => {
    expect(splitReplyMention('@[Bob] r:1a2b:00')).toEqual({
      mention: '@[Bob]',
      body: 'r:1a2b:00',
    });
  });

  it('trims surrounding whitespace and preserves names with spaces', () => {
    expect(splitReplyMention('  @[Node One]   g:xy  ')).toEqual({
      mention: '@[Node One]',
      body: 'g:xy',
    });
  });

  it('returns null without a leading reply mention', () => {
    expect(splitReplyMention('g:abc123')).toBeNull();
    expect(splitReplyMention('hello world')).toBeNull();
    expect(splitReplyMention('@[Alice]')).toBeNull(); // mention only, no body
    expect(splitReplyMention('text @[Alice] g:abc')).toBeNull(); // not a leading mention
  });
});
