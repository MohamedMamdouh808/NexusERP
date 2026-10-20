import { describe, expect, it } from 'vitest';
import { allStates } from '../state-manifest';

describe('State manifest guard (T046, FR-061, SC-014)', () => {
  it('ensures every state in the manifest has a non-empty fixture and assertion', () => {
    const states = allStates();
    expect(states.length).toBeGreaterThan(0);

    for (const { component, state, entry } of states) {
      expect(
        entry.fixture && entry.fixture.trim().length > 0,
        `Component ${component} state ${state} has missing or empty fixture slot`,
      ).toBe(true);

      expect(
        entry.assertion && entry.assertion.trim().length > 0,
        `Component ${component} state ${state} has missing or empty assertion`,
      ).toBe(true);

      // Verify that fixture follows Component.state format
      expect(entry.fixture).toBe(`${component}.${state}`);
    }
  });

  it('fails deliberately if an entry has an empty fixture or assertion', () => {
    // Negative test proving the guard logic catches empty definitions
    const defectiveEntry = { fixture: '', assertion: 'has role button' };
    const checkValid = (entry: { fixture: string; assertion: string }) =>
      entry.fixture.trim().length > 0 && entry.assertion.trim().length > 0;

    expect(checkValid(defectiveEntry)).toBe(false);
  });
});
