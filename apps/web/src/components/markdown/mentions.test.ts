import { describe, it, expect } from 'vitest';
import { findMentionRanges } from './mentions';

describe('findMentionRanges', () => {
  it('finds a single mention', () => {
    const ranges = findMentionRanges('hey @emre!', [{ id: 'u1', displayName: 'emre' }]);
    expect(ranges).toEqual([{ start: 4, end: 9, user: { id: 'u1', displayName: 'emre' } }]);
  });

  it('is case-insensitive and longest-match-first', () => {
    const names = [
      { id: 'u1', displayName: 'emre' },
      { id: 'u2', displayName: 'emreyc' },
    ];
    expect(findMentionRanges('@emreyc', names)[0].user.id).toBe('u2');
    expect(findMentionRanges('@EMRE ', names)[0].user.id).toBe('u1');
  });

  it('does not match inside a longer token', () => {
    expect(findMentionRanges('@emreyc', [{ id: 'u1', displayName: 'emre' }])).toEqual([]);
  });

  it('skips overlapping shorter matches once claimed', () => {
    const names = [
      { id: 'u1', displayName: 'emre' },
      { id: 'u2', displayName: 'emre yc' },
    ];
    const ranges = findMentionRanges('@emre yc done', names);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].user.id).toBe('u2');
  });

  it('returns no ranges without @ or names', () => {
    expect(findMentionRanges('nothing here', [{ id: 'u1', displayName: 'emre' }])).toEqual([]);
    expect(findMentionRanges('@emre', [])).toEqual([]);
  });

  it('ignores leading-boundary at-usage like emails', () => {
    expect(
      findMentionRanges('mail me at bob@emre.com', [{ id: 'u1', displayName: 'emre' }]),
    ).toEqual([]);
  });
});
