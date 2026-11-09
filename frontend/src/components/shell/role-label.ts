/**
 * The role labels the interface can name.
 *
 * The service answers `roleKey` (`administrator`, `member`, ...). The two known
 * v1 keys get their human labels; an unknown key shows capitalized rather than
 * invented, so a future role still reads honestly.
 */

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  member: 'Member',
};

export function roleLabel(roleKey: string): string {
  const known = ROLE_LABELS[roleKey];
  return known ?? roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
}
