/**
 * Masks a SQL statement so it can be logged without leaking values.
 *
 * Prisma already sends parameterized statements, but a statement can carry inline
 * string literals (enum casts, DDL, migration helpers), so every single-quoted
 * literal is replaced as a second line of defence. The bind parameters are never
 * logged at all: they are the values that would carry passwords, tokens, emails
 * and names.
 *
 * The result is truncated because a log line is for attribution, not for replay.
 */
export function maskQueryText(query: string): string {
  return query
    .replace(/'(?:[^']|'')*'/g, '[?]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
}
