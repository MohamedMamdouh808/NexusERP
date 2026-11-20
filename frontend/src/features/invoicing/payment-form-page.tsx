import { useTranslation } from 'react-i18next';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { INVOICING_PERMISSIONS, PAYMENT_PERMISSIONS } from '@nexuserp/shared';
import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, Input, Select, Skeleton } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import { centsToString, toCents } from '../../lib/quantity';
import { hasPermission, useSession } from '../../services/auth-session';
import { useContacts } from '../contacts/use-contacts';
import type { PaymentMethod } from '../../services/catalog-service';
import { useOpenInvoices, useRecordPayment } from './use-invoicing';
import { allocationFailureDetail, requestReference } from './errors';

const methods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];
const idem = () =>
  globalThis.crypto?.randomUUID?.() ??
  `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);

/**
 * The Record-payment screen needs BOTH `payments.record` and `invoices.read`:
 * an allocation cannot be offered without reading the invoice balances. The
 * outer component answers that before any form hook mounts, so a member
 * without the pair never triggers an invoice read.
 */
export function PaymentFormPage() {
  const { t } = useTranslation();
  const session = useSession();
  const mayRecord =
    hasPermission(session, PAYMENT_PERMISSIONS.record) &&
    hasPermission(session, INVOICING_PERMISSIONS.read);
  if (!mayRecord) {
    return (
      <section className="payment-form-page" aria-label={t('invoicing.form.ariaLabel')}>
        <PageHeader title={t('invoicing.form.title')} description={t('invoicing.form.description')} />
        <Card title={t('invoicing.form.title')}>
          <p role="alert">{t('invoicing.form.permissionDenied')}</p>
        </Card>
      </section>
    );
  }
  return <PaymentForm />;
}

function PaymentForm() {
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();
  const formSchema = useMemo(
    () =>
      z.object({
        customerId: z.string().min(1, t('invoicing.form.customerRequired')),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, t('invoicing.form.amountDecimals'))
          .refine((value) => toCents(value) > 0n, t('invoicing.form.amountPositive')),
        paymentDate: z.string().min(1, t('invoicing.form.dateRequired')),
        method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
        reference: z.string(),
      }),
    [t],
  );
  type FormFields = z.infer<typeof formSchema>;

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const customers = useContacts({ role: 'customer', status: 'active', page: 1, pageSize: 100 });
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // One key per mount: every retry of this form reuses it, and opening the
  // form again is a new attempt with a new key.
  const [idempotencyKey] = useState(idem);
  const post = useRecordPayment();
  const preselectedCustomer = params.get('customer') ?? '';
  const {
    register,
    watch,
    handleSubmit,
    setValue,
    setError: setFieldError,
    formState: { errors },
  } = useForm<FormFields>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      customerId: preselectedCustomer,
      amount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'BANK_TRANSFER',
      reference: '',
    },
  });
  const customerId = watch('customerId');
  const amount = watch('amount');
  const invoices = useOpenInvoices(customerId);
  const methodLabel = (method: PaymentMethod) =>
    method === 'CASH'
      ? t('invoicing.form.methodCash')
      : method === 'BANK_TRANSFER'
        ? t('invoicing.form.methodBankTransfer')
        : method === 'CARD'
          ? t('invoicing.form.methodCard')
          : t('invoicing.form.methodOther');
  // Deep-link prefill: once, when the linked invoice arrives. Reading the live
  // allocations through a ref keeps this from re-firing while the user edits
  // rows - mid-edit empty values must never overwrite the typed amount.
  const allocationsRef = useRef(allocations);
  allocationsRef.current = allocations;
  useEffect(() => {
    const selectedId = params.get('invoice');
    const selected = invoices.data?.find((item) => item.id === selectedId);
    if (selected && !allocationsRef.current[selected.id]) {
      setAllocations((previous) => ({ ...previous, [selected.id]: selected.balance }));
      setValue('amount', selected.balance);
    }
  }, [invoices.data, params, setValue]);
  const allocatedCents = useMemo(
    () =>
      Object.values(allocations).reduce(
        (sum, value) => sum + (validMoney(value) ? toCents(value) : 0n),
        0n,
      ),
    [allocations],
  );
  const openTotal = invoices.data?.reduce((sum, item) => sum + toCents(item.balance), 0n) ?? 0n;
  const allocationError =
    Object.entries(allocations)
      .map(([id, value]) => {
        const row = invoices.data?.find((item) => item.id === id);
        if (value && !validMoney(value)) return t('invoicing.form.allocationError');
        return row && value && toCents(value) > toCents(row.balance)
          ? t('invoicing.form.allocationExceeds', {
              balance: formatMoneyLocalized(row.balance, currency, 2),
            })
          : '';
      })
      .find(Boolean) ?? '';
  const parsedAmount = amount && /^\d+(\.\d{1,2})?$/.test(amount) ? toCents(amount) : 0n;
  const totalsInvalid = parsedAmount > 0n && allocatedCents !== parsedAmount;
  const aboveOpen = parsedAmount > openTotal;

  function allocateOldest() {
    let remaining = parsedAmount;
    const next: Record<string, string> = {};
    for (const invoice of invoices.data ?? []) {
      const cents = toCents(invoice.balance);
      const allocated = cents < remaining ? cents : remaining;
      if (allocated > 0n) next[invoice.id] = centsToString(allocated);
      remaining -= allocated;
    }
    setAllocations(next);
  }

  /**
   * One sentence for a refusal: the service's message, then the invoice and
   * balance it named (BALANCE_CHANGED / OVER_ALLOCATION), then the request
   * identifier the user can quote.
   */
  function failureMessage(failure: unknown): string {
    const parts = [
      failure instanceof Error && failure.message !== ''
        ? failure.message
        : t('invoicing.form.paymentInvalid'),
    ];
    const allocation = allocationFailureDetail(failure);
    if (allocation !== null) {
      const invoice = invoices.data?.find((item) => item.id === allocation.invoiceId);
      const number = invoice?.number ?? allocation.invoiceId ?? '';
      if (number !== '' && allocation.currentBalance !== undefined) {
        parts.push(
          t('invoicing.form.allocationFailure', {
            number,
            balance: formatMoneyLocalized(allocation.currentBalance, currency, 2),
          }),
        );
      }
    }
    const reference = requestReference(failure);
    if (reference !== null) parts.push(t('invoicing.requestId', { id: reference }));
    return parts.join(' ');
  }

  const submit = handleSubmit((raw) => {
    const valid = formSchema.safeParse(raw);
    if (!valid.success) {
      for (const issue of valid.error.issues) {
        const field = issue.path[0];
        if (
          field === 'customerId' ||
          field === 'amount' ||
          field === 'paymentDate' ||
          field === 'method' ||
          field === 'reference'
        ) {
          setFieldError(field, { type: 'zod', message: issue.message });
        }
      }
      setError('');
      return;
    }
    setError('');
    if (Object.values(allocations).filter(Boolean).length === 0) {
      setError(t('invoicing.form.allocationsRequired'));
      return;
    }
    if (allocationError) {
      setError(allocationError);
      return;
    }
    if (totalsInvalid) {
      setError(t('invoicing.form.allocationsMustMatch'));
      return;
    }
    if (aboveOpen) {
      setError(t('invoicing.form.overpaymentNotAccepted'));
      return;
    }
    post.mutate(
      {
        ...valid.data,
        idempotencyKey,
        allocations: Object.entries(allocations)
          .filter(([, value]) => value && toCents(value) > 0n)
          .map(([invoiceId, value]) => ({
            invoiceId,
            amount: value,
            expectedBalance: invoices.data?.find((invoice) => invoice.id === invoiceId)?.balance,
          })),
      },
      {
        onSuccess: (result) =>
          navigate(`/invoicing/payments/${result.id}`, {
            state: { notice: t('invoicing.form.recordedToast', { number: result.number }) },
          }),
        onError: (failure) => setError(failureMessage(failure)),
      },
    );
  });

  if (customers.isPending)
    return (
      <section aria-label={t('invoicing.form.ariaLabel')}>
        <PageHeader title={t('invoicing.form.title')} />
        <Card title={t('invoicing.payment.title')}>
          <Skeleton label={t('invoicing.form.loadingCustomers')} />
        </Card>
      </section>
    );
  if (customers.data?.items.length === 0)
    return (
      <section aria-label={t('invoicing.form.ariaLabel')}>
        <PageHeader title={t('invoicing.form.title')} description={t('invoicing.form.description')} />
        <Card title={t('invoicing.form.title')}>
          <div className="empty-state">
            <h3>{t('invoicing.form.noOpenInvoicesHeading')}</h3>
            <p>{t('invoicing.form.noOpenInvoicesGlobalDescription')}</p>
            <Link to="/invoicing">{t('invoicing.form.goToInvoices')}</Link>
          </div>
        </Card>
      </section>
    );
  return (
    <section className="payment-form-page" aria-label={t('invoicing.form.ariaLabel')}>
      <PageHeader title={t('invoicing.form.title')} description={t('invoicing.form.description')} />
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Card title={t('invoicing.form.paymentDetails')}>
          <div className="payment-fields">
            <Select
              id="payment-customer"
              label={t('invoicing.form.customer')}
              required
              value={customerId}
              options={(customers.data?.items ?? []).map((customer) => ({
                value: customer.id,
                label: customer.name,
              }))}
              placeholder={t('invoicing.form.chooseCustomer')}
              error={errors.customerId?.message}
              {...register('customerId', {
                validate: (value) => value !== '' || t('invoicing.form.customerRequired'),
              })}
            />
            <Input
              id="payment-amount"
              label={t('invoicing.form.amount')}
              required
              className="numeric-cell"
              inputMode="decimal"
              placeholder={t('invoicing.form.amountPlaceholder')}
              error={errors.amount?.message}
              {...register('amount', {
                validate: (value) => {
                  const parsed = formSchema.shape.amount.safeParse(value);
                  return (
                    parsed.success || parsed.error.issues[0]?.message || t('invoicing.form.amountInvalid')
                  );
                },
              })}
            />
            <Input
              id="payment-date"
              label={t('invoicing.form.date')}
              type="date"
              required
              error={errors.paymentDate?.message}
              {...register('paymentDate', {
                validate: (value) => value !== '' || t('invoicing.form.dateRequired'),
              })}
            />
            <Select
              id="payment-method"
              label={t('invoicing.form.method')}
              options={methods.map((value) => ({ value, label: methodLabel(value) }))}
              {...register('method')}
            />
            <Input id="payment-reference" label={t('invoicing.form.reference')} {...register('reference')} />
          </div>
        </Card>
        <Card title={t('invoicing.form.openInvoices')}>
          {customerId && !invoices.isPending && (invoices.data?.length ?? 0) === 0 ? (
            <div className="empty-state">
              <h3>{t('invoicing.form.noOpenInvoices')}</h3>
              <p>{t('invoicing.form.noOpenInvoicesDescription')}</p>
              <Link to="/invoicing">{t('invoicing.form.goToInvoices')}</Link>
            </div>
          ) : !customerId ? (
            <p>{t('invoicing.form.chooseCustomerFirst')}</p>
          ) : invoices.isPending ? (
            <Skeleton label={t('invoicing.form.loadingOpenInvoices')} />
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('invoicing.form.columns.invoice')}</th>
                      <th>{t('invoicing.form.columns.dueDate')}</th>
                      <th className="numeric-cell">{t('invoicing.form.columns.total')}</th>
                      <th className="numeric-cell">{t('invoicing.form.columns.balance')}</th>
                      <th>{t('invoicing.form.columns.allocation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices.data ?? []).map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="doc-number">
                          {invoice.number ?? t('invoicing.detail.draftInvoice')}
                        </td>
                        <td>{invoice.dueDate}</td>
                        <td className="numeric-cell">{formatMoneyLocalized(invoice.total, currency, 2)}</td>
                        <td className="numeric-cell">
                          {formatMoneyLocalized(invoice.balance, currency, 2)}
                        </td>
                        <td>
                          <div className="allocation-input">
                            <input
                              aria-label={t('invoicing.form.allocationAriaLabel', {
                                number: invoice.number ?? '',
                              })}
                              inputMode="decimal"
                              aria-invalid={
                                allocations[invoice.id] && !validMoney(allocations[invoice.id])
                                  ? 'true'
                                  : undefined
                              }
                              value={allocations[invoice.id] ?? ''}
                              onChange={(event) =>
                                setAllocations((previous) => ({
                                  ...previous,
                                  [invoice.id]: event.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              onClick={() =>
                                setAllocations((previous) => ({
                                  ...previous,
                                  [invoice.id]: invoice.balance,
                                }))
                              }
                            >
                              {t('invoicing.form.payFullBalance')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button type="button" onClick={allocateOldest}>
                {t('invoicing.form.allocateOldest')}
              </Button>
            </>
          )}
        </Card>
        {customerId && (
          <Card title={t('invoicing.form.allocationSummary')}>
            <div className="invoice-metrics">
              <div>
                <span>{t('invoicing.form.amount')}</span>
                <strong>{formatMoneyLocalized(amount || '0.00', currency, 2)}</strong>
              </div>
              <div>
                <span>{t('invoicing.form.allocated')}</span>
                <strong>{formatMoneyLocalized(centsToString(allocatedCents), currency, 2)}</strong>
              </div>
              <div>
                <span>{t('invoicing.form.remaining')}</span>
                <strong>
                  {formatMoneyLocalized(centsToString(parsedAmount - allocatedCents), currency, 2)}
                </strong>
              </div>
            </div>
            {allocationError && (
              <p className="form-error" role="alert">
                {allocationError}
              </p>
            )}
            {totalsInvalid && (
              <p className="form-error" role="alert">
                {t('invoicing.form.allocationsMustMatch')}
              </p>
            )}
            {aboveOpen && (
              <p className="form-error" role="alert">
                {t('invoicing.form.overpaymentNotAccepted')}
              </p>
            )}
          </Card>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="payment-submit">
          <Button type="button" onClick={() => navigate(-1)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={post.isPending} disabled={post.isPending || !customerId}>
            {t('invoicing.form.title')}
          </Button>
        </div>
      </form>
    </section>
  );
}
