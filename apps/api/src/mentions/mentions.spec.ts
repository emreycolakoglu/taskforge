import { parseMentions, MentionCandidate } from './mentions';

function user(id: string, displayName: string): MentionCandidate {
  return { id, displayName };
}

describe('parseMentions', () => {
  it('resolves a simple mention', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('ping @emre please', users)).toEqual([user('u1', 'emre')]);
  });

  it('matches display names case-insensitively', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('ping @Emre please', users)).toEqual([user('u1', 'emre')]);
  });

  it('matches display names containing spaces', () => {
    const users = [user('u1', 'Test User 42')];
    expect(parseMentions('ping @Test User 42!', users)).toEqual([user('u1', 'Test User 42')]);
  });

  it('prefers the longest name on overlap', () => {
    const users = [user('u1', 'emre'), user('u2', 'emreyc')];
    expect(parseMentions('ping @emreyc', users)).toEqual([user('u2', 'emreyc')]);
    expect(parseMentions('ping @emre ', users)).toEqual([user('u1', 'emre')]);
  });

  it('does not match when the name is a prefix of the token', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('ping @emreyc', users)).toEqual([]);
  });

  it('dedupes repeated mentions of the same user', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('@emre and @EMRE again', users)).toEqual([user('u1', 'emre')]);
  });

  it('resolves multiple distinct users', () => {
    const users = [user('u1', 'emre'), user('u2', 'alice')];
    expect(parseMentions('@emre @alice', users)).toEqual([user('u2', 'alice'), user('u1', 'emre')]);
  });

  it('ignores emails and non-mention at-usage', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('mail me at bob@emre.com', users)).toEqual([]);
  });

  it('returns empty for text without @ or without candidates', () => {
    const users = [user('u1', 'emre')];
    expect(parseMentions('no mentions here', users)).toEqual([]);
    expect(parseMentions('@emre', [])).toEqual([]);
    expect(parseMentions('', users)).toEqual([]);
  });

  it('handles names with regex special characters', () => {
    const users = [user('u1', 'a.b (c)')];
    expect(parseMentions('ping @a.b (c)', users)).toEqual([user('u1', 'a.b (c)')]);
  });
});
