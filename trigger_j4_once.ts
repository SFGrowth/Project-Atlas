/**
 * One-shot J4 trigger for live chain proof.
 * Run with: cd /home/ubuntu/atlas-nexus && npx tsx trigger_j4_once.ts
 * Delete after use.
 */
import 'dotenv/config';
import { runJ4PatternDiscovery } from './server/darwin/darwin-j4-pattern-discovery.js';

console.log('[J4-TRIGGER] Starting direct J4 run at', new Date().toISOString());
try {
  const result = await runJ4PatternDiscovery();
  console.log('[J4-TRIGGER] Result:', JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error('[J4-TRIGGER] Error:', err);
  process.exit(1);
}
