-- Migration: invoices_immutability + invoice_lines insert-only.
--
-- Two protection sets live here:
--
-- 1. invoices_immutability - BEFORE UPDATE on invoices:
--    - once the invoice is not DRAFT, customer_id, sales_order_id, number,
--      issue_date and total are immutable;
--    - status may only change via the allowed map:
--        DRAFT            -> ISSUED | VOID
--        ISSUED           -> PARTIALLY_PAID | PAID | VOID
--        PARTIALLY_PAID   -> PAID | ISSUED
--        PAID             -> PARTIALLY_PAID | ISSUED
--      VOID is terminal; anything else raises;
--    - the void fields (void_reason, voided_at, voided_by) may only be set on
--      the transition INTO VOID, and only together (the together rule is a
--      table CHECK; entering VOID requires all three present);
--    - due_date may change only while the invoice is DRAFT, never to before
--      the creation date;
--    - version may only increase; created_by / created_at never change.
--
-- 2. invoice_lines is insert-only: UPDATE, DELETE (row-level) and TRUNCATE
--    (statement-level) are rejected by triggers, regardless of invoice status.
--    There is no line-mutation path in this feature at all.
--
-- All functions are schema-pinned and run with an empty search_path.

DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.invoices_immutability()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        -- Once not DRAFT, the header fields are immutable.
        IF OLD.status <> 'DRAFT' THEN
          IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
             OR NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id
             OR NEW.number IS DISTINCT FROM OLD.number
             OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
             OR NEW.total IS DISTINCT FROM OLD.total THEN
            RAISE EXCEPTION 'invoices_immutability: issued invoice fields are immutable';
          END IF;
        END IF;

        -- Status may only change via the allowed transition map. VOID is terminal.
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          IF NOT (
            (OLD.status = 'DRAFT'          AND NEW.status IN ('ISSUED', 'VOID'))
            OR (OLD.status = 'ISSUED'      AND NEW.status IN ('PARTIALLY_PAID', 'PAID', 'VOID'))
            OR (OLD.status = 'PARTIALLY_PAID' AND NEW.status IN ('PAID', 'ISSUED'))
            OR (OLD.status = 'PAID'        AND NEW.status IN ('PARTIALLY_PAID', 'ISSUED'))
          ) THEN
            RAISE EXCEPTION 'invoices_immutability: transition % -> % is not allowed', OLD.status, NEW.status;
          END IF;
        END IF;

        -- The void fields may only change on the transition into VOID.
        IF NEW.void_reason IS DISTINCT FROM OLD.void_reason
           OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
           OR NEW.voided_by IS DISTINCT FROM OLD.voided_by THEN
          IF NOT (NEW.status = 'VOID' AND OLD.status <> 'VOID') THEN
            RAISE EXCEPTION 'invoices_immutability: void fields may only be set on the transition into VOID';
          END IF;
        END IF;

        -- Entering VOID requires reason, timestamp and actor, all together.
        IF NEW.status = 'VOID' AND OLD.status <> 'VOID' THEN
          IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = ''
             OR NEW.voided_at IS NULL
             OR NEW.voided_by IS NULL THEN
            RAISE EXCEPTION 'invoices_immutability: entering VOID requires void_reason, voided_at and voided_by';
          END IF;
        END IF;

        -- Only a draft may change its due date, and never to before creation.
        IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
          IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'invoices_immutability: due_date may only change while the invoice is a draft';
          END IF;
          IF NEW.due_date IS NOT NULL AND NEW.due_date < (OLD.created_at::date) THEN
            RAISE EXCEPTION 'invoices_immutability: due_date may not precede the creation date';
          END IF;
        END IF;

        -- The version may only increase; the creating actor and time never change.
        IF NEW.version < OLD.version THEN
          RAISE EXCEPTION 'invoices_immutability: version may only increase';
        END IF;
        IF NEW.created_by IS DISTINCT FROM OLD.created_by
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'invoices_immutability: created_by and created_at never change';
        END IF;

        RETURN NEW;
      END;
    $fn$
  );

  EXECUTE format('DROP TRIGGER IF EXISTS invoices_immutability ON %I.invoices', target_schema);
  EXECUTE format(
    'CREATE TRIGGER invoices_immutability
       BEFORE UPDATE ON %I.invoices
       FOR EACH ROW
       EXECUTE FUNCTION %I.invoices_immutability()',
    target_schema,
    target_schema
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.invoice_lines_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'invoice_lines is insert-only: UPDATE is not permitted';
      END;
    $fn$
  );
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.invoice_lines_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'invoice_lines is insert-only: DELETE is not permitted';
      END;
    $fn$
  );
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.invoice_lines_reject_truncate()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'invoice_lines is insert-only: TRUNCATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format('DROP TRIGGER IF EXISTS invoice_lines_reject_update ON %I.invoice_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER invoice_lines_reject_update
       BEFORE UPDATE ON %I.invoice_lines
       FOR EACH ROW
       EXECUTE FUNCTION %I.invoice_lines_reject_update()',
    target_schema,
    target_schema
  );
  EXECUTE format('DROP TRIGGER IF EXISTS invoice_lines_reject_delete ON %I.invoice_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER invoice_lines_reject_delete
       BEFORE DELETE ON %I.invoice_lines
       FOR EACH ROW
       EXECUTE FUNCTION %I.invoice_lines_reject_delete()',
    target_schema,
    target_schema
  );
  EXECUTE format('DROP TRIGGER IF EXISTS invoice_lines_reject_truncate ON %I.invoice_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER invoice_lines_reject_truncate
       BEFORE TRUNCATE ON %I.invoice_lines
       FOR EACH STATEMENT
       EXECUTE FUNCTION %I.invoice_lines_reject_truncate()',
    target_schema,
    target_schema
  );
END $$;

-- Statement-level protection: no TRUNCATE by anyone holding the public grant.
REVOKE TRUNCATE ON TABLE "invoice_lines" FROM PUBLIC;
