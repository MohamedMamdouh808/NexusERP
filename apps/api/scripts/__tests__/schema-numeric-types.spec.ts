import {
  ALLOWED_PRECISIONS,
  analyzeSchemaFile,
  analyzeSchemaText,
  defaultSchemaPath,
} from '../check-schema-numeric-types';

/**
 * Constitution Principle IV, made structural.
 *
 * A comment in schema.prisma asking developers not to use Float is advice that a
 * deadline erodes. These tests prove the GATE detects a Float column and approves the
 * documented precisions, so a Float in a later feature is a failing build.
 */
describe('analyzeSchemaText', () => {
  const cleanSchema = `
generator client {
  provider = "prisma-client-js"
}

model InvoiceLine {
  id        String  @id @default(uuid()) @db.Uuid
  quantity  Decimal @db.Decimal(14, 3)
  unitPrice Decimal @db.Decimal(14, 4)
  lineTotal Decimal @db.Decimal(14, 2)
}
`;

  it('accepts the documented precisions', () => {
    expect(analyzeSchemaText(cleanSchema)).toEqual([]);
  });

  it('rejects a Float column and says why', () => {
    const withFloat = cleanSchema.replace(
      'quantity  Decimal @db.Decimal(14, 3)',
      'quantity  Float',
    );
    const findings = analyzeSchemaText(withFloat);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('float-column');
    expect(findings[0]?.message).toContain('Constitution Principle IV');
    expect(findings[0]?.message).toContain('Decimal(14,2)');
  });

  it('rejects a Float column on a money field', () => {
    const withFloatTotal = cleanSchema.replace(
      'lineTotal Decimal @db.Decimal(14, 2)',
      'lineTotal Float',
    );
    const findings = analyzeSchemaText(withFloatTotal);
    expect(findings.some((finding) => finding.rule === 'float-column')).toBe(true);
  });

  it('rejects a decimal precision that is not one of the three documented kinds', () => {
    const wrongPrecision = cleanSchema.replace('@db.Decimal(14, 2)', '@db.Decimal(10, 2)');
    const findings = analyzeSchemaText(wrongPrecision);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('bad-precision');
    expect(findings[0]?.message).toContain('not an approved precision');
  });

  it('rejects a Decimal with no explicit precision', () => {
    const noPrecision = cleanSchema.replace('Decimal @db.Decimal(14, 4)', 'Decimal');
    const findings = analyzeSchemaText(noPrecision);
    expect(findings.some((finding) => finding.rule === 'bad-precision')).toBe(true);
  });

  it('ignores a Float mentioned in a comment, because prose is not a column', () => {
    const mentionedInComment = `
model StockBalance {
  id String @id @default(uuid()) @db.Uuid
  // Never use Float here - it breaks Principle IV.
  onHand Decimal @db.Decimal(14, 3)
}
`;
    expect(analyzeSchemaText(mentionedInComment)).toEqual([]);
  });

  it('approves exactly three precisions', () => {
    expect(ALLOWED_PRECISIONS).toEqual(['Decimal(14,2)', 'Decimal(14,4)', 'Decimal(14,3)']);
  });
});

describe('the real schema', () => {
  it('passes the checker', () => {
    const findings = analyzeSchemaFile(defaultSchemaPath());
    expect(findings).toEqual([]);
  });
});