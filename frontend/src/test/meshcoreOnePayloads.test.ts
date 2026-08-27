/**
 * Tests for MeshCore One reaction hashing/parsing and reply-quote parsing.
 *
 * Hash test vectors are cross-checked against an independent Python
 * (hashlib) implementation of the documented algorithm, and match
 * MeshCore One's own Swift unit test inputs ("Hello"/1704067200 ->
 * "b45pc4ek" reproduces the exact worked example from Reactions.md).
 */

import { describe, it, expect } from 'vitest';
import {
  buildMeshcoreOneReactionText,
  computeReactionHash,
  parseMeshcoreOneReaction,
  parseMeshcoreOneReply,
} from '../utils/meshcoreOnePayloads';

describe('computeReactionHash', () => {
  it('matches known-good cross-language vectors', () => {
    expect(computeReactionHash('Hello', 1704067200)).toBe('b45pc4ek');
    expect(computeReactionHash('World', 1704067200)).toBe('vp1vxnf4');
    expect(computeReactionHash('Hello', 1704067201)).toBe('3wh8x8z5');
    expect(computeReactionHash('', 0)).toBe('vwzp3604');
    expect(computeReactionHash('👍 nice!', 1787366382)).toBe('dhare318');
  });

  it('is deterministic', () => {
    expect(computeReactionHash('same text', 42)).toBe(computeReactionHash('same text', 42));
  });

  it('is always 8 lowercase Crockford Base32 characters', () => {
    const hash = computeReactionHash('anything', 123);
    expect(hash).toMatch(/^[0-9a-hj-km-tv-z]{8}$/);
  });
});

describe('parseMeshcoreOneReaction (channel)', () => {
  const parse = (text: string) => parseMeshcoreOneReaction(text, false);

  it('parses a channel reaction', () => {
    expect(parse('👍@[AlphaNode]\n7f3a9c12')).toEqual({
      emoji: '👍',
      targetSenderName: 'AlphaNode',
      hash: '7f3a9c12',
    });
  });

  it('normalizes an uppercase or mixed-case hash to lowercase', () => {
    expect(parse('👍@[Node]\nABCDEF12')?.hash).toBe('abcdef12');
    expect(parse('👍@[Node]\nAbCdEf12')?.hash).toBe('abcdef12');
  });

  it('decodes Crockford substitution characters (O -> 0, I/L -> 1)', () => {
    expect(parse('👍@[Node]\nOOOOOOOO')?.hash).toBe('00000000');
    expect(parse('👍@[Node]\niiiiiiii')?.hash).toBe('11111111');
    expect(parse('👍@[Node]\nLLLLLLLL')?.hash).toBe('11111111');
  });

  it('allows a sender name containing a colon', () => {
    expect(parse('👍@[Node:Alpha]\na1b2c3d4')?.targetSenderName).toBe('Node:Alpha');
  });

  it('returns null for plain text', () => {
    expect(parse('Just a normal message')).toBeNull();
  });

  it('returns null when the emoji segment is missing or not emoji-like', () => {
    expect(parse('@[Node]\na1b2c3d4')).toBeNull();
    expect(parse('hello\na1b2c3d4')).toBeNull();
  });

  it('returns null for missing brackets around the sender (no "@[" at all)', () => {
    expect(parse('👍@Node\na1b2c3d4')).toBeNull();
  });

  it('returns null for a missing or malformed hash', () => {
    expect(parse('👍@[Node]')).toBeNull();
    expect(parse('👍@[Node]\nabc')).toBeNull();
    expect(parse('👍@[Node]\ntoolonghash1')).toBeNull();
  });

  it("returns null for invalid Crockford characters ('u' is excluded)", () => {
    expect(parse('👍@[Node]\nuuuuuuuu')).toBeNull();
  });

  it('returns null for a DM-shaped reaction (channel form requires "@[")', () => {
    expect(parse('👍\n7f3a9c12')).toBeNull();
  });
});

describe('parseMeshcoreOneReaction (DM)', () => {
  const parse = (text: string) => parseMeshcoreOneReaction(text, true);

  it('parses a DM reaction (no sender)', () => {
    expect(parse('👍\n7f3a9c12')).toEqual({
      emoji: '👍',
      targetSenderName: null,
      hash: '7f3a9c12',
    });
  });

  it('returns null when the text contains a channel-style "@[" mention', () => {
    expect(parse('👍@[AlphaNode]\n7f3a9c12')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parse('Just a normal message')).toBeNull();
  });

  it('returns null for a missing or malformed hash', () => {
    expect(parse('👍')).toBeNull();
    expect(parse('👍\nabc')).toBeNull();
  });
});

describe('parseMeshcoreOneReply', () => {
  it('parses a reply with a truncated quote preview', () => {
    expect(parseMeshcoreOneReply('@[GWQ]\n>Heading to..\nNice!')).toEqual({
      mentionName: 'GWQ',
      quotePreview: 'Heading to..',
      body: 'Nice!',
    });
  });

  it('parses a reply whose quote preview was not truncated', () => {
    expect(parseMeshcoreOneReply('@[Bob]\n>hi there\nHow are you?')).toEqual({
      mentionName: 'Bob',
      quotePreview: 'hi there',
      body: 'How are you?',
    });
  });

  it('preserves a multi-line reply body', () => {
    expect(parseMeshcoreOneReply('@[Bob]\n>quoted..\nline one\nline two')).toEqual({
      mentionName: 'Bob',
      quotePreview: 'quoted..',
      body: 'line one\nline two',
    });
  });

  it('returns null for a bare mention with no reply body', () => {
    expect(parseMeshcoreOneReply('@[Bob] hello')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseMeshcoreOneReply('hello world')).toBeNull();
  });

  it('returns null for a MeshCore One reaction (no reply header)', () => {
    expect(parseMeshcoreOneReply('👍@[Node]\na1b2c3d4')).toBeNull();
  });
});

describe('buildMeshcoreOneReactionText', () => {
  it('builds channel-form text that round-trips through the parser', () => {
    const text = buildMeshcoreOneReactionText('👍', 'AlphaNode', 'Hello there', 1700000000);
    const parsed = parseMeshcoreOneReaction(text, false);
    expect(parsed).toEqual({
      emoji: '👍',
      targetSenderName: 'AlphaNode',
      hash: computeReactionHash('Hello there', 1700000000),
    });
  });

  it('builds DM-form text (no sender) that round-trips through the parser', () => {
    const text = buildMeshcoreOneReactionText('❤️', null, 'hi', 1700000000);
    const parsed = parseMeshcoreOneReaction(text, true);
    expect(parsed).toEqual({
      emoji: '❤️',
      targetSenderName: null,
      hash: computeReactionHash('hi', 1700000000),
    });
  });
});
