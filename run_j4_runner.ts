import { runJ4PatternDiscovery } from './server/darwin/darwin-j4-pattern-discovery.js';

async function main() {
  console.log('[J4-RUNNER] Starting J4 pattern discovery...');
  try {
    const result = await runJ4PatternDiscovery();
    console.log('[J4-RUNNER] Status:', result.status);
    if (result.chain) {
      console.log('[J4-RUNNER] CHAIN COMPLETE:');
      console.log(JSON.stringify({
        SOURCE_EVENT_ID: result.chain.sourceEventId,
        OBSERVATION_ID: result.chain.observationId,
        HYPOTHESIS_ID: result.chain.hypothesisId,
        JOB_ID: result.chain.jobId,
        RESULT_ID: result.chain.resultId,
        FINDING_ID: result.chain.findingId,
        NOTIFICATION_ID: result.chain.notificationId,
        TELEGRAM_MSG_ID: result.chain.telegramMessageId,
        CLASSIFICATION: result.chain.resultClassification,
        SAMPLE_SIZE: result.chain.historicalSampleSize,
        PLAIN_ENGLISH: result.chain.plainEnglishFinding,
      }, null, 2));
    }
    if (result.reason) console.log('[J4-RUNNER] Reason:', result.reason);
    if (result.duplicatePrevented) console.log('[J4-RUNNER] Duplicate prevented:', result.duplicatePrevented);
    if (result.error) console.log('[J4-RUNNER] Error:', result.error);
  } catch (e) {
    console.error('[J4-RUNNER] FAILED:', e);
    process.exit(1);
  }
  process.exit(0);
}

main();
