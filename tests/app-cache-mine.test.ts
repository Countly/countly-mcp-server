import { describe, it, expect } from 'vitest';
import { appsFromMineResponse } from '../src/lib/app-cache.js';

describe('appsFromMineResponse', () => {
  const a = { _id: 'a1', name: 'Alpha' };
  const b = { _id: 'b2', name: 'Beta' };

  it('lists administered and used apps once each', () => {
    expect(appsFromMineResponse({ admin_of: { a1: a }, user_of: { a1: a, b2: b } })).toEqual([a, b]);
  });

  it('lists apps a member only uses (a read-only token has no admin_of)', () => {
    expect(appsFromMineResponse({ admin_of: {}, user_of: { b2: b } })).toEqual([b]);
    expect(appsFromMineResponse({ user_of: { b2: b } })).toEqual([b]);
  });

  it('accepts an array or an apps list, and nothing else', () => {
    expect(appsFromMineResponse([a])).toEqual([a]);
    expect(appsFromMineResponse({ apps: [b] })).toEqual([b]);
    expect(appsFromMineResponse(null)).toEqual([]);
    expect(appsFromMineResponse('x')).toEqual([]);
    expect(appsFromMineResponse({})).toEqual([]);
  });
});
