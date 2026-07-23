import { describe, it, expect } from 'vitest';

describe('Massive.com API Key', () => {
  it('should authenticate and return futures data', async () => {
    const apiKey = process.env.MASSIVE_API_KEY;
    expect(apiKey, 'MASSIVE_API_KEY must be set').toBeTruthy();

    const res = await fetch(
      'https://api.massive.com/futures/v1/aggs/MNQM5?resolution=5min&limit=1',
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string; results: unknown[] };
    expect(data.status).toBe('OK');
    expect(data.results.length).toBeGreaterThan(0);
  });
});
