import { describe, it, expect } from 'vitest';
import { matchCliCommands, commandPrefix, CLI_COMMANDS } from '../utils/cliCommands';

describe('cliCommands', () => {
  it('returns no matches for empty input', () => {
    expect(matchCliCommands('')).toEqual([]);
    expect(matchCliCommands('   ')).toEqual([]);
  });

  it('suggests completions for a partial command name', () => {
    const matches = matchCliCommands('set r');
    const syntaxes = matches.map((m) => m.syntax);
    expect(syntaxes).toContain('set radio <freq>,<bw>,<sf>,<cr>');
    expect(syntaxes).toContain('set repeat <state>');
    expect(syntaxes.every((s) => s.toLowerCase().startsWith('set r'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchCliCommands('SET NAME')).toEqual(matchCliCommands('set name'));
  });

  it('surfaces the parameter signature once the command name is fully typed', () => {
    const matches = matchCliCommands('set tx 20');
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe('set tx <dbm>');
  });

  it('prioritizes an exact literal-prefix match first', () => {
    const matches = matchCliCommands('gps');
    expect(matches[0].syntax).toBe('gps');
  });

  it('caps results at the given limit', () => {
    expect(matchCliCommands('g', 3)).toHaveLength(3);
  });

  it('every command has a non-empty literal prefix', () => {
    for (const cmd of CLI_COMMANDS) {
      expect(commandPrefix(cmd.syntax).length).toBeGreaterThan(0);
    }
  });

  it('suggests the sensor-role io GPIO sub-forms', () => {
    const syntaxes = matchCliCommands('io').map((m) => m.syntax);
    expect(syntaxes).toEqual(
      expect.arrayContaining(['io', 'io <hex_val>', 'io s <hex_mask>', 'io r <hex_mask>', 'io t <hex_mask>'])
    );
  });

  it('reflects multi.acks and loop.detect as verified against firmware source', () => {
    const multiAcks = CLI_COMMANDS.find((c) => c.syntax.startsWith('set multi.acks'));
    expect(multiAcks?.syntax).toBe('set multi.acks <0|1>');

    const loopDetect = CLI_COMMANDS.find((c) => c.syntax.startsWith('set loop.detect'));
    expect(loopDetect?.syntax).toBe('set loop.detect <off|minimal|moderate|strict>');
  });
});
