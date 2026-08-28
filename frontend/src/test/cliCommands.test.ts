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
});
