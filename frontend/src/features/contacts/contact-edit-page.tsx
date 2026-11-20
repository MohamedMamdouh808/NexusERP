import { useTranslation } from 'react-i18next';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONTACT_PERMISSIONS } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, Checkbox, ErrorState, Input } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { useContact, useUpdateContact } from './use-contacts';
import type { Contact } from '../../services/contacts-client';

interface FormState {
  name: string;
  email: string;
  phone: string;
  isCustomer: boolean;
  isSupplier: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  role?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toFormState(contact: Contact): FormState {
  return {
    name: contact.name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    isCustomer: contact.isCustomer,
    isSupplier: contact.isSupplier,
    addressLine1: contact.addressLine1 ?? '',
    addressLine2: contact.addressLine2 ?? '',
    city: contact.city ?? '',
    region: contact.region ?? '',
    postalCode: contact.postalCode ?? '',
    country: contact.country ?? '',
  };
}

export function ContactEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contactId = id ?? '';
  const session = useSession();
  const { t } = useTranslation();
  const canWrite = hasPermission(session, CONTACT_PERMISSIONS.write);
  const { data, isPending, isError, error, refetch } = useContact(contactId);
  const updateMutation = useUpdateContact();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<{ message: string; requestId: string } | null>(null);
  const [staleVersion, setStaleVersion] = useState(false);

  useEffect(() => {
    if (data && !form) {
      setForm(toFormState(data));
    }
  }, [data, form]);

  if (isPending) {
    return (
      <section className="contact-edit-page" aria-label={t('contacts.form.editTitle')}>
        <PageHeader title={t('contacts.form.editTitle')} />
        <Card title={t('contacts.form.editTitle')}>
          <span>{t('contacts.form.loading')}</span>
        </Card>
      </section>
    );
  }

  if (isError || data === undefined) {
    return (
      <section className="contact-edit-page" aria-label={t('contacts.form.editTitle')}>
        <PageHeader title={t('contacts.form.editTitle')} />
        <Card title={t('contacts.form.editTitle')}>
          <ErrorState message={error instanceof Error ? error.message : t('contacts.form.loadError')} />
        </Card>
      </section>
    );
  }

  const contact: Contact = data;

  if (!canWrite) {
    return (
      <section className="contact-edit-page" aria-label={t('contacts.form.editTitle')}>
        <PageHeader title={t('contacts.form.editTitle')} />
        <Card title={t('contacts.form.editTitle')}>
          <ErrorState message={t('contacts.form.forbiddenEdit')} />
          <Button variant="default" onClick={() => navigate(`/contacts/${contactId}`)}>
            {t('common.actions.back')}
          </Button>
        </Card>
      </section>
    );
  }

  if (!form) {
    return null;
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form!.name.trim()) next.name = t('contacts.form.nameRequired');
    if (!form!.isCustomer && !form!.isSupplier) next.role = t('contacts.form.roleRequired');
    if (form!.email.trim() && !EMAIL_PATTERN.test(form!.email.trim())) {
      next.email = t('contacts.form.emailInvalid');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    setStaleVersion(false);
    if (!validate()) return;

    updateMutation.mutate(
      {
        id: contactId,
        input: {
          // The version travels with the change: the service refuses a write that
          // was prepared against an older version of the record.
          version: contact.version,
          name: form!.name.trim(),
          email: form!.email.trim() || null,
          phone: form!.phone.trim() || null,
          isCustomer: form!.isCustomer,
          isSupplier: form!.isSupplier,
          addressLine1: form!.addressLine1.trim() || null,
          addressLine2: form!.addressLine2.trim() || null,
          city: form!.city.trim() || null,
          region: form!.region.trim() || null,
          postalCode: form!.postalCode.trim() || null,
          country: form!.country.trim() || null,
        },
      },
      {
        onSuccess: () => {
          navigate(`/contacts/${contactId}`);
        },
        onError: (caught) => {
          const err = caught as Error & { code?: string; requestId?: string };
          if (err.code === 'STALE_VERSION') {
            setStaleVersion(true);
          } else {
            setServerError({ message: err.message, requestId: err.requestId ?? 'unknown' });
          }
        },
      },
    );
  }

  const update = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <section className="contact-edit-page" aria-label={t('contacts.form.editTitle')}>
      <PageHeader
        title={t('contacts.form.editTitle')}
        description={t('contacts.form.descriptionEdit', { name: contact.name })}
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/contacts/${contactId}`)}>
            {t('common.actions.cancel')}
          </Button>
        }
      />
      <Card title={t('contacts.form.editTitle')}>
        {staleVersion && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{t('contacts.form.staleBanner')}</p>
            <Button
              variant="default"
              type="button"
              onClick={() => {
                setStaleVersion(false);
                setForm(null);
                void refetch();
              }}
            >
              {t('contacts.form.reloadContact')}
            </Button>
          </div>
        )}
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              {t('ui.errorState.referenceLabel')}
              <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="contact-edit-page__form" noValidate={true}>
          <fieldset className="contact-form__section">
            <legend>{t('contacts.form.details')}</legend>
            <Input
              id="name"
              label={t('contacts.fields.name')}
              error={errors.name}
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              required
            />
            <div className="contact-form__row">
              <Input
                id="email"
                label={t('contacts.fields.email')}
                type="email"
                error={errors.email}
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
              <Input
                id="phone"
                label={t('contacts.fields.phone')}
                type="tel"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </div>
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>{t('contacts.form.role')}</legend>
            <div className="contact-form__roles">
              <Checkbox
                id="isCustomer"
                label={t('contacts.form.isCustomer')}
                checked={form.isCustomer}
                onChange={(e) => update({ isCustomer: e.target.checked })}
              />
              <Checkbox
                id="isSupplier"
                label={t('contacts.form.isSupplier')}
                checked={form.isSupplier}
                onChange={(e) => update({ isSupplier: e.target.checked })}
              />
            </div>
            {errors.role && (
              <p role="alert" className="form-error">
                {errors.role}
              </p>
            )}
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>{t('contacts.form.address')}</legend>
            <Input
              id="addressLine1"
              label={t('contacts.fields.addressLine1')}
              value={form.addressLine1}
              onChange={(e) => update({ addressLine1: e.target.value })}
            />
            <Input
              id="addressLine2"
              label={t('contacts.fields.addressLine2')}
              value={form.addressLine2}
              onChange={(e) => update({ addressLine2: e.target.value })}
            />
            <div className="contact-form__row">
              <Input
                id="city"
                label={t('contacts.fields.city')}
                value={form.city}
                onChange={(e) => update({ city: e.target.value })}
              />
              <Input
                id="region"
                label={t('contacts.fields.region')}
                value={form.region}
                onChange={(e) => update({ region: e.target.value })}
              />
            </div>
            <div className="contact-form__row">
              <Input
                id="postalCode"
                label={t('contacts.fields.postalCode')}
                value={form.postalCode}
                onChange={(e) => update({ postalCode: e.target.value })}
              />
              <Input
                id="country"
                label={t('contacts.fields.country')}
                value={form.country}
                onChange={(e) => update({ country: e.target.value })}
              />
            </div>
          </fieldset>

          <div className="contact-form__actions">
            <Button
              variant="primary"
              type="submit"
              disabled={updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              {updateMutation.isPending ? t('contacts.form.saving') : t('contacts.form.save')}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate(`/contacts/${contactId}`)}>
              {t('common.actions.cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
