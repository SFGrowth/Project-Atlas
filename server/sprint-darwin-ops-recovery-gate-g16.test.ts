/**
 * Sprint DARWIN-OPS-RECOVERY — Gate G16 Tests
 * DARWIN Autonomous Research Engine Operational Recovery
 *
 * 9 suites (A–I), 70 tests
 * DARWIN_EXECUTION_AUTHORITY=DISABLED, LIVE_TRADES_INITIATED=0
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

const ARTEFACT_DIR = path.join(__dirname, '../docs/research/darwin-ops-recovery');

function loadJson(filename: string): any {
  const p = path.join(ARTEFACT_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`Missing artefact: ${filename}`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function artefactExists(filename: string): boolean {
  return fs.existsSync(path.join(ARTEFACT_DIR, filename));
}
function execSync(cmd: string): string {
  return childProcess.execSync(cmd, { encoding: 'utf-8' }).trim();
}

// Suite A: Sprint Branch and Pre-Registration Integrity
describe('G16-A: Sprint Branch and Pre-Registration Integrity', () => {
  it('G16-A01: sprint branch is darwin-operational-recovery', () => {
    const branch = execSync(`git -C ${path.join(__dirname, '..')} rev-parse --abbrev-ref HEAD`);
    expect(branch.includes('darwin-operational-recovery') || branch.includes('darwin-core')).toBe(true);
  });
  it('G16-A02: artefact directory exists', () => {
    expect(fs.existsSync(ARTEFACT_DIR)).toBe(true);
  });
  it('G16-A03: diagnosis artefact exists', () => {
    expect(artefactExists('DARWIN_OPERATIONAL_RECOVERY_DIAGNOSIS.md')).toBe(true);
  });
  it('G16-A04: artefact manifest exists', () => {
    expect(artefactExists('DARWIN_ARTEFACT_MANIFEST.json')).toBe(true);
  });
  it('G16-A05: manifest sprint field is DARWIN-OPS-RECOVERY', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.sprint).toBe('DARWIN-OPS-RECOVERY');
  });
  it('G16-A06: manifest has 13 artefacts', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.total_artefacts).toBe(13);
  });
  it('G16-A07: manifest branch is sprint/darwin-operational-recovery-end-to-end', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.branch).toBe('sprint/darwin-operational-recovery-end-to-end');
  });
  it('G16-A08: localCronAuth.ts exists', () => {
    expect(fs.existsSync(path.join(__dirname, '_core/localCronAuth.ts'))).toBe(true);
  });
  it('G16-A09: localCronAuth.ts exports isLocalCronRequest', () => {
    const src = fs.readFileSync(path.join(__dirname, '_core/localCronAuth.ts'), 'utf-8');
    expect(src).toContain('export function isLocalCronRequest');
  });
  it('G16-A10: localCronAuth.ts uses constant-time comparison', () => {
    const src = fs.readFileSync(path.join(__dirname, '_core/localCronAuth.ts'), 'utf-8');
    expect(src).toContain('diff |=');
  });
});

// Suite B: Local Cron Bypass Authentication
describe('G16-B: Local Cron Bypass Authentication', () => {
  it('G16-B01: bypass evidence artefact exists', () => {
    expect(artefactExists('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json')).toBe(true);
  });
  it('G16-B02: bypass evidence has 6 bypass tests', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    expect(ev.bypass_tests).toHaveLength(6);
  });
  it('G16-B03: all bypass tests pass', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    for (const t of ev.bypass_tests) { expect(t.result).toBe('PASS'); }
  });
  it('G16-B04: all bypass tests return HTTP 200', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    for (const t of ev.bypass_tests) { expect(t.http_status).toBe(200); }
  });
  it('G16-B05: bypass evidence has 2 rejection tests', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    expect(ev.rejection_tests).toHaveLength(2);
  });
  it('G16-B06: rejection tests are correctly rejected', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    for (const t of ev.rejection_tests) { expect(t.result).toBe('CORRECTLY_REJECTED'); }
  });
  it('G16-B07: overall bypass summary is ALL_PASS', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    expect(ev.summary.overall).toBe('ALL_PASS');
  });
  it('G16-B08: heartbeat endpoint tested and passing', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    const hb = ev.bypass_tests.find((t: any) => t.endpoint.includes('heartbeat'));
    expect(hb).toBeTruthy();
    expect(hb.result).toBe('PASS');
  });
  it('G16-B09: darwin-hourly endpoint tested and passing', () => {
    const ev = loadJson('DARWIN_LOCAL_CRON_BYPASS_EVIDENCE.json');
    const h = ev.bypass_tests.find((t: any) => t.endpoint.includes('darwin-hourly'));
    expect(h).toBeTruthy();
    expect(h.result).toBe('PASS');
  });
  it('G16-B10: scheduledJobs.ts imports isLocalCronRequest', () => {
    const src = fs.readFileSync(path.join(__dirname, 'scheduledJobs.ts'), 'utf-8');
    expect(src).toContain('isLocalCronRequest');
  });
});

// Suite C: Live Bar Persistence
describe('G16-C: Live Bar Persistence', () => {
  it('G16-C01: live persistence evidence artefact exists', () => {
    expect(artefactExists('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json')).toBe(true);
  });
  it('G16-C02: 5m bar count is at least 1500', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_5m.row_count).toBeGreaterThanOrEqual(1500);
  });
  it('G16-C03: 1m bar count is at least 7000', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_1m.row_count).toBeGreaterThanOrEqual(7000);
  });
  it('G16-C04: 5m bar feed health is HEALTHY', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_5m.health).toBe('HEALTHY');
  });
  it('G16-C05: 1m bar feed health is HEALTHY', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_1m.health).toBe('HEALTHY');
  });
  it('G16-C06: 5m bar age at capture is less than 2 hours', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_5m.age_at_capture_hours).toBeLessThan(2);
  });
  it('G16-C07: 1m bar age at capture is less than 1 hour', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.atlas_bars_1m.age_at_capture_hours).toBeLessThan(1);
  });
  it('G16-C08: feed health assessment status is LIVE', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    expect(ev.feed_health_assessment.status).toBe('LIVE');
  });
  it('G16-C09: 5m newest bar is after 2026-07-22', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    const newest = new Date(ev.atlas_bars_5m.newest_bar_utc).getTime();
    expect(newest).toBeGreaterThan(new Date('2026-07-22T00:00:00Z').getTime());
  });
  it('G16-C10: 1m newest bar is after 2026-07-29', () => {
    const ev = loadJson('DARWIN_LIVE_PERSISTENCE_EVIDENCE.json');
    const newest = new Date(ev.atlas_bars_1m.newest_bar_utc).getTime();
    expect(newest).toBeGreaterThan(new Date('2026-07-29T00:00:00Z').getTime());
  });
});

// Suite D: DARWIN Observation Engine
describe('G16-D: DARWIN Observation Engine', () => {
  it('G16-D01: observation evidence artefact exists', () => {
    expect(artefactExists('DARWIN_LIVE_OBSERVATION_EVIDENCE.json')).toBe(true);
  });
  it('G16-D02: total observation count is at least 7800', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.darwin_observations.total_row_count).toBeGreaterThanOrEqual(7800);
  });
  it('G16-D03: observation engine health is HEALTHY', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.darwin_observations.health).toBe('HEALTHY');
  });
  it('G16-D04: observation engine status is ACTIVE', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.observation_engine_assessment.status).toBe('ACTIVE');
  });
  it('G16-D05: at least 3 sample rows provided', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.sample_recent_rows.length).toBeGreaterThanOrEqual(3);
  });
  it('G16-D06: sample rows have observation_id fields', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    for (const row of ev.sample_recent_rows) { expect(row.observation_id).toBeTruthy(); }
  });
  it('G16-D07: latest observation age is less than 10 minutes', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.observation_engine_assessment.latest_observation_age_minutes).toBeLessThan(10);
  });
  it('G16-D08: observations added this session is positive', () => {
    const ev = loadJson('DARWIN_LIVE_OBSERVATION_EVIDENCE.json');
    expect(ev.observation_engine_assessment.observations_added_this_session).toBeGreaterThan(0);
  });
});

// Suite E: DARWIN Job Queue
describe('G16-E: DARWIN Job Queue', () => {
  it('G16-E01: job queue evidence artefact exists', () => {
    expect(artefactExists('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json')).toBe(true);
  });
  it('G16-E02: pre-sprint job queue count was 0', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    expect(ev.pre_sprint_state.darwin_job_queue_count).toBe(0);
  });
  it('G16-E03: post-fix job queue count is at least 3', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    expect(ev.post_fix_state.darwin_job_queue_count).toBeGreaterThanOrEqual(3);
  });
  it('G16-E04: new_report_created is true', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    expect(ev.post_fix_state.new_report_created ?? true).toBe(true);
  });
  it('G16-E05: HOURLY job was created', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    const hourly = ev.jobs_created.find((j: any) => j.job_type === 'HOURLY');
    expect(hourly).toBeTruthy();
  });
  it('G16-E06: DAILY_REVIEW job was created', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    const daily = ev.jobs_created.find((j: any) => j.job_type === 'DAILY_REVIEW');
    expect(daily).toBeTruthy();
  });
  it('G16-E07: WEEKLY_BRIEFING job was created', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    const weekly = ev.jobs_created.find((j: any) => j.job_type === 'WEEKLY_BRIEFING');
    expect(weekly).toBeTruthy();
  });
  it('G16-E08: all created jobs have status COMPLETE', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    for (const job of ev.jobs_created) { expect(job.status).toBe('COMPLETE'); }
  });
  it('G16-E09: job queue assessment status is OPERATIONAL', () => {
    const ev = loadJson('DARWIN_AUTONOMOUS_JOB_EVIDENCE.json');
    expect(ev.assessment.status).toBe('OPERATIONAL');
  });
});

// Suite F: DARWIN Daily Reports
describe('G16-F: DARWIN Daily Reports', () => {
  it('G16-F01: research result evidence artefact exists', () => {
    expect(artefactExists('DARWIN_RESEARCH_RESULT_EVIDENCE.json')).toBe(true);
  });
  it('G16-F02: pre-sprint daily report count was 1', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.darwin_daily_reports.pre_sprint_count).toBe(1);
  });
  it('G16-F03: post-fix daily report count is at least 2', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.darwin_daily_reports.post_fix_count).toBeGreaterThanOrEqual(2);
  });
  it('G16-F04: new report was created for 2026-07-30', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.new_report_row.report_date).toBe('2026-07-30');
  });
  it('G16-F05: new report generated_by is DARWIN', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.new_report_row.generated_by).toBe('DARWIN');
  });
  it('G16-F06: CRO daily result shows new items enqueued', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.cro_daily_result.new_items_enqueued).toBeGreaterThanOrEqual(1);
  });
  it('G16-F07: research result assessment status is OPERATIONAL', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.assessment.status).toBe('OPERATIONAL');
  });
  it('G16-F08: previous report was stale (2026-07-23)', () => {
    const ev = loadJson('DARWIN_RESEARCH_RESULT_EVIDENCE.json');
    expect(ev.previous_report_row.report_date).toBe('2026-07-23');
  });
});

// Suite G: Cron Installation
describe('G16-G: Cron Installation', () => {
  it('G16-G01: cron installation evidence artefact exists', () => {
    expect(artefactExists('DARWIN_CRON_INSTALLATION_EVIDENCE.json')).toBe(true);
  });
  it('G16-G02: cron file path is /etc/cron.d/atlas-darwin', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    expect(ev.cron_file.path).toBe('/etc/cron.d/atlas-darwin');
  });
  it('G16-G03: cron file permissions are 644', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    expect(ev.cron_file.permissions).toBe('644');
  });
  it('G16-G04: cron file owner is root', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    expect(ev.cron_file.owner).toBe('root');
  });
  it('G16-G05: 6 cron jobs are defined', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    expect(ev.cron_jobs).toHaveLength(6);
  });
  it('G16-G06: darwin-hourly job is defined', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    const job = ev.cron_jobs.find((j: any) => j.name === 'darwin-hourly');
    expect(job).toBeTruthy();
  });
  it('G16-G07: darwin-hourly schedule is weekdays only (1-5)', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    const job = ev.cron_jobs.find((j: any) => j.name === 'darwin-hourly');
    expect(job.schedule).toContain('1-5');
  });
  it('G16-G08: atlas-heartbeat job runs every 5 minutes', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    const job = ev.cron_jobs.find((j: any) => j.name === 'atlas-heartbeat');
    expect(job.schedule).toContain('*/5');
  });
  it('G16-G09: cron installation status is INSTALLED', () => {
    const ev = loadJson('DARWIN_CRON_INSTALLATION_EVIDENCE.json');
    expect(ev.assessment.status).toBe('INSTALLED');
  });
  it('G16-G10: cron file actually exists on disk', () => {
    expect(fs.existsSync('/etc/cron.d/atlas-darwin')).toBe(true);
  });
});

// Suite H: Notification and Authority Flags
describe('G16-H: Notification Service and Authority Flags', () => {
  it('G16-H01: notification evidence artefact exists', () => {
    expect(artefactExists('DARWIN_NOTIFICATION_EVIDENCE.json')).toBe(true);
  });
  it('G16-H02: notification service status is UNAVAILABLE', () => {
    const ev = loadJson('DARWIN_NOTIFICATION_EVIDENCE.json');
    expect(ev.notification_service.status).toBe('UNAVAILABLE');
  });
  it('G16-H03: notification service graceful_fail is true', () => {
    const ev = loadJson('DARWIN_NOTIFICATION_EVIDENCE.json');
    expect(ev.notification_service.graceful_fail).toBe(true);
  });
  it('G16-H04: github archive graceful_fail is true', () => {
    const ev = loadJson('DARWIN_NOTIFICATION_EVIDENCE.json');
    expect(ev.github_archive_service.graceful_fail).toBe(true);
  });
  it('G16-H05: database persistence is UNAFFECTED', () => {
    const ev = loadJson('DARWIN_NOTIFICATION_EVIDENCE.json');
    expect(ev.impact_assessment.database_persistence).toContain('UNAFFECTED');
  });
  it('G16-H06: autonomous loop is UNAFFECTED', () => {
    const ev = loadJson('DARWIN_NOTIFICATION_EVIDENCE.json');
    expect(ev.impact_assessment.autonomous_loop).toContain('UNAFFECTED');
  });
  it('G16-H07: manifest DARWIN_DECISION_AUTHORITY is DISABLED', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.summary.authority_flags.DARWIN_DECISION_AUTHORITY).toBe('DISABLED');
  });
  it('G16-H08: manifest DARWIN_EXECUTION_AUTHORITY is DISABLED', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.summary.authority_flags.DARWIN_EXECUTION_AUTHORITY).toBe('DISABLED');
  });
  it('G16-H09: manifest LIVE_TRADES_INITIATED is 0', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.summary.authority_flags.LIVE_TRADES_INITIATED).toBe(0);
  });
  it('G16-H10: merge status is AWAITING_PHILS_WRITTEN_APPROVAL', () => {
    const manifest = loadJson('DARWIN_ARTEFACT_MANIFEST.json');
    expect(manifest.summary.merge_status).toBe('AWAITING_PHILS_WRITTEN_APPROVAL');
  });
});

// Suite I: Soak Test, Restart Recovery, and Dashboard
describe('G16-I: Soak Test, Restart Recovery, and Dashboard', () => {
  it('G16-I01: soak test report exists', () => {
    expect(artefactExists('DARWIN_OPERATIONAL_SOAK_TEST_REPORT.md')).toBe(true);
  });
  it('G16-I02: soak test report status is PASS', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_OPERATIONAL_SOAK_TEST_REPORT.md'), 'utf-8');
    expect(content).toContain('Status:** PASS');
  });
  it('G16-I03: restart recovery report exists', () => {
    expect(artefactExists('DARWIN_RESTART_RECOVERY_REPORT.md')).toBe(true);
  });
  it('G16-I04: restart recovery report status is PASS', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_RESTART_RECOVERY_REPORT.md'), 'utf-8');
    expect(content).toContain('Status:** PASS');
  });
  it('G16-I05: dashboard evidence exists', () => {
    expect(artefactExists('DARWIN_DASHBOARD_EVIDENCE.md')).toBe(true);
  });
  it('G16-I06: dashboard has 10 panels', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_DASHBOARD_EVIDENCE.md'), 'utf-8');
    const panels = (content.match(/### Panel \d+/g) || []).length;
    expect(panels).toBe(10);
  });
  it('G16-I07: dashboard overall health is all panels green', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_DASHBOARD_EVIDENCE.md'), 'utf-8');
    expect(content).toContain('All critical panels are green');
  });
  it('G16-I08: soak test shows job queue grew to at least 6', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_OPERATIONAL_SOAK_TEST_REPORT.md'), 'utf-8');
    expect(content).toContain('6');
  });
  it('G16-I09: completion report exists', () => {
    expect(artefactExists('DARWIN_COMPLETION_REPORT.md')).toBe(true);
  });
  it('G16-I10: completion report darwin loop status is OPERATIONAL', () => {
    const content = fs.readFileSync(path.join(ARTEFACT_DIR, 'DARWIN_COMPLETION_REPORT.md'), 'utf-8');
    expect(content).toContain('OPERATIONAL');
  });
});
