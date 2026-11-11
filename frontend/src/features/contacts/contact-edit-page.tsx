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
      <section className="contact-edit-page" aria-label="Edit contact">
        <PageHeader title="Edit Contact" />
        <Card title="Edit Contact">
          <span>Loading contact…</span>
        </Card>
      </section>
    );
  }

  if (isError || data === undefined) {
    return (
      <section className="contact-edit-page" aria-label="Edit contact">
        <PageHeader title="Edit Contact" />
        <Card title="Edit Contact">
          <ErrorState message={error instanceof Error ? error.message : 'The contact could not be loaded.'} />
        </Card>
      </section>
    );
  }

  const contact: Contact = data;

  if (!canWrite) {
    return (
      <section className="contact-edit-page" aria-label="Edit contact">
        <PageHeader title="Edit Contact" />
        <Card title="Edit Contact">
          <ErrorState message="You do not have permission to change contacts." />
          <Button variant="default" onClick={() => navigate(`/contacts/${contactId}`)}>
            Back to contact
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
    if (!form!.name.trim()) next.name = 'Name is required.';
    if (!form!.isCustomer && !form!.isSupplier) next.role = 'Select at least one role.';
    if (form!.email.trim() && !EMAIL_PATTERN.test(form!.email.trim())) {
      next.email = 'Enter a valid email address.';
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
    <section className="contact-edit-page" aria-label="Edit contact">
      <PageHeader
        title="Edit Contact"
        description={`Editing “${contact.name}”.`}
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/contacts/${contactId}`)}>
            Cancel
          </Button>
        }
      />
      <Card title="Edit Contact">
        {staleVersion && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>This contact was changed by someone else. Reload the latest version before saving.</p>
            <Button
              variant="default"
              type="button"
              onClick={() => {
                setStaleVersion(false);
                setForm(null);
                void refetch();
              }}
            >
              Reload the contact
            </Button>
          </div>
        )}
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              Reference ID: <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="contact-edit-page__form" noValidate={true}>
          <fieldset className="contact-form__section">
            <legend>Details</legend>
            <Input
              id="name"
              label="Name"
              error={errors.name}
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              required
            />
            <div className="contact-form__row">
              <Input
                id="email"
                label="Email"
                type="email"
                error={errors.email}
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
              <Input
                id="phone"
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </div>
          </fieldset>

          <fieldset className="contact-form__section">
            <legend>Role</legend>
            <div className="contact-form__roles">
              <Checkbox
                id="isCustomer"
                label="Customer"
                checked={form.isCustomer}
                onChange={(e) => update({ isCustomer: e.target.checked })}
              />
              <Checkbox
                id="isSupplier"
                label="Supplier"
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
            <legend>Address</legend>
            <Input
              id="addressLine1"
              label="Address line 1"
              value={form.addressLine1}
              onChange={(e) => update({ addressLine1: e.target.value })}
            />
            <Input
              id="addressLine2"
              label="Address line 2"
              value={form.addressLine2}
              onChange={(e) => update({ addressLine2: e.target.value })}
            />
            <div className="contact-form__row">
              <Input
                id="city"
                label="City"
                value={form.city}
                onChange={(e) => update({ city: e.target.value })}
              />
              <Input
                id="region"
                label="Region"
                value={form.region}
                onChange={(e) => update({ region: e.target.value })}
              />
            </div>
            <div className="contact-form__row">
              <Input
                id="postalCode"
                label="Postal code"
                value={form.postalCode}
                onChange={(e) => update({ postalCode: e.target.value })}
              />
              <Input
                id="country"
                label="Country"
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
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate(`/contacts/${contactId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
