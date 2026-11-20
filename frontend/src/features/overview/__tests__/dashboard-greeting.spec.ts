import { describe, expect, it } from 'vitest';

import { greetingKey } from '../dashboard-page';

/** The greeting follows the member's working hours, not a fixed "Hello". */
describe('Dashboard greeting', () => {
  it('picks the greeting that matches the hour', () => {
    expect(greetingKey(0)).toBe('greetingEvening');
    expect(greetingKey(4)).toBe('greetingEvening');
    expect(greetingKey(5)).toBe('greetingMorning');
    expect(greetingKey(8)).toBe('greetingMorning');
    expect(greetingKey(11)).toBe('greetingMorning');
    expect(greetingKey(12)).toBe('greetingAfternoon');
    expect(greetingKey(16)).toBe('greetingAfternoon');
    expect(greetingKey(17)).toBe('greetingEvening');
    expect(greetingKey(23)).toBe('greetingEvening');
  });
});
