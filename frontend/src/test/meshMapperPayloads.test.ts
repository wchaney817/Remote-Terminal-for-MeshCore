/**
 * Tests for MeshMapper wardriving wire-tag parsing.
 *
 * Format is ported from MeshMapper's wire_tag_codec.dart; see
 * meshMapperPayloads.ts.
 */

import { describe, it, expect } from 'vitest';
import { osmUrlForCoords, parseWireTag } from '../utils/meshMapperPayloads';

describe('parseWireTag', () => {
  it('parses a bare wire tag (privacy mode)', () => {
    expect(parseWireTag('MM:sEeVLxybkg')).toEqual({
      tag: 'sEeVLxybkg',
      lat: null,
      lon: null,
    });
  });

  it('parses a wire tag with broadcast coordinates', () => {
    expect(parseWireTag('MM:LWGnvRHm1A:32.77709,-97.31966')).toEqual({
      tag: 'LWGnvRHm1A',
      lat: 32.77709,
      lon: -97.31966,
    });
  });

  it('accepts base64url characters (- and _) in the tag body', () => {
    expect(parseWireTag('MM:bGUa-42bzA')?.tag).toBe('bGUa-42bzA');
    expect(parseWireTag('MM:2-_mj2RA4Q')?.tag).toBe('2-_mj2RA4Q');
  });

  it('trims surrounding whitespace', () => {
    expect(parseWireTag('  MM:sEeVLxybkg  ')?.tag).toBe('sEeVLxybkg');
  });

  it('returns null for malformed tags', () => {
    expect(parseWireTag('MM:short')).toBeNull(); // too short (< 10 chars)
    expect(parseWireTag('MM:waytoolongtag123')).toBeNull(); // too long (> 10 chars)
    expect(parseWireTag('MM:')).toBeNull();
    expect(parseWireTag('mm:sEeVLxybkg')).toBeNull(); // prefix is case-sensitive
    expect(parseWireTag('hello world')).toBeNull();
  });

  it('returns null when the coordinate suffix is malformed', () => {
    expect(parseWireTag('MM:sEeVLxybkg:not,coords')).toBeNull();
    expect(parseWireTag('MM:sEeVLxybkg:32.77709')).toBeNull(); // missing longitude
  });

  it('builds an OpenStreetMap link for broadcast coordinates', () => {
    const url = osmUrlForCoords(32.77709, -97.31966);
    expect(url).toContain('mlat=32.77709');
    expect(url).toContain('mlon=-97.31966');
  });
});
