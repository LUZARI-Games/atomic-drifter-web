import { describe, expect, it } from 'vitest';
import { systemColor, systemId, UNKNOWN_SYSTEM_COLOR } from './systems';

describe('system colours (same as Ship Interior Planner)', () => {
  it('uses the planner colour per system', () => {
    expect(systemColor({ system: 'reactor', color: null })).toBe('#59D96B');
    expect(systemColor({ system: 'cockpit', color: null })).toBe('#C77DFF');
  });

  it('normalises planner/legacy ids', () => {
    expect(systemId('MedBay')).toBe('medbay');
    expect(systemId('Engines')).toBe('engine');
    expect(systemColor({ system: 'Shields', color: null })).toBe('#3FD5E0');
  });

  it('a colour stored on the room wins', () => {
    expect(systemColor({ system: 'reactor', color: '#123456' })).toBe('#123456');
  });

  it('unknown systems get the fallback', () => {
    expect(systemColor({ system: 'warp_core', color: null })).toBe(UNKNOWN_SYSTEM_COLOR);
    expect(systemColor(undefined)).toBe(UNKNOWN_SYSTEM_COLOR);
  });
});
