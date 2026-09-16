import { getTeamColor, ensureTournamentTeamColors } from './teamColors';
import { describe, it, expect } from 'vitest';

describe('teamColors util', () => {
  it('returns puttPirates defaults when override missing', () => {
    expect(getTeamColor('puttPirates', 'teamA', '')).toBe('#0b3d3a');
    expect(getTeamColor('puttPirates', 'teamB', null)).toBe('#c9a227');
  });

  it('falls back to the default series for an unknown series', () => {
    expect(getTeamColor('somethingElse', 'teamA', '')).toBe('#0b3d3a');
    expect(getTeamColor(undefined, 'teamB', undefined)).toBe('#c9a227');
  });

  it('prefers override when provided', () => {
    expect(getTeamColor('puttPirates', 'teamA', '#abcdef')).toBe('#abcdef');
  });

  it('ensureTournamentTeamColors populates missing colors', () => {
    const t = { series: 'puttPirates', teamA: { id: 'teamA', name: 'A', color: '' }, teamB: { id: 'teamB', name: 'B' } } as any;
    const out = ensureTournamentTeamColors(t) as any;
    expect(out.teamA.color).toBe('#0b3d3a');
    expect(out.teamB.color).toBe('#c9a227');
  });
});
