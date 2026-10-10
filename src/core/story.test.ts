import { describe, expect, it } from 'vitest';
import { defaultRun, parseRun } from './run';
import { PAUSE_NAME, START_CREW, introFor, markBriefed, needsIntro, startCrewCount } from './story';

describe('run premise', () => {
  it('the intro shows once per run (old saves without the flag show it once too)', () => {
    const run = defaultRun();
    expect(needsIntro(run)).toBe(true);
    expect(needsIntro(markBriefed(run))).toBe(false);
    expect(needsIntro(parseRun(JSON.parse(JSON.stringify(markBriefed(run)))))).toBe(false);
    expect(needsIntro(parseRun({ shipName: 'OLD' }))).toBe(true);
  });

  it('Iron Mall start: 3 survivors, EXTRA RECRUIT adds one', () => {
    expect(START_CREW).toBe(3);
    expect(startCrewCount(defaultRun())).toBe(3);
    expect(startCrewCount({ ...defaultRun(), modifiers: ['extra_recruit'] })).toBe(4);
    expect(introFor('ironmall').home).toBe('IRON MALL');
    expect(introFor('nobody').title).toBe(introFor().title);
    expect(PAUSE_NAME).toBe('P.A.U.S.E. – PROMETHEUS ATOMIC UNIVERSAL STASIS ENGINE');
  });
});
