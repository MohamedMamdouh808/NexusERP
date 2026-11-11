import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONTACT_PERMISSIONS } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, Checkbox, ErrorState, Input } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { useCreateContact } from './use-contacts';
import type { CreateContactInput } from './use-contacts';

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
  [key: string]: string | undefined;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactNewPage() {
  const navigate = useNavigate();
  const session = useSession();
  const canWrite = hasPermission(session, CONTACT_PERMISSIONS.write);
  const createMutation = useCreateContact();
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    isCustomer: true,
    isSupplier: false,
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<{ message: string; requestId: string } | null>(null);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!form.isCustomer && !form.isSupplier) next.role = 'Select at least one role.';
    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;

    const input: CreateContactInput = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      isCustomer: form.isCustomer,
      isSupplier: form.isSupplier,
      addressLine1: form.addressLine1.trim() || null,
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      postalCode: form.postalCode.trim() || null,
      country: form.country.trim() || null,
    };

    createMutation.mutate(input, {
      onSuccess: (contact) => {
        navigate(`/contacts/${contact.id}`);
      },
      onError: (caught) => {
        const err = caught as Error & {
          requestId?: string;
          details?: { field: string | null; message: string | null }[];
        };
        setServerError({ message: err.message, requestId: err.requestId ?? 'unknown' });
        const next: FormErrors = { ...errors };
        for (const d of err.details ?? []) {
          if (d.field) next[d.field] = d.message ?? err.message;
        }
        setErrors(next);
      },
    });
  }

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  if (!canWrite) {
    return (
      <section className="contact-new-page" aria-label="New contact">
        <PageHeader title="New Contact" />
        <Card title="New Contact">
          <ErrorState message="You do not have permission to create contacts." />
          <Button variant="default" onClick={() => navigate('/contacts')}>
            Back to contacts
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="contact-new-page" aria-label="New contact">
      <PageHeader
        title="New Contact"
        description="Add a customer or a supplier. The code is assigned by the service."
        primaryAction={
          <Button variant="default" onClick={() => navigate('/contacts')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Contact">
        {serverError && (
          <div role="alert" aria-live="assertive" className="form-error contact-form__server-error">
            <p>{serverError.message}</p>
            <p className="contact-form__reference">
              Reference ID: <code>{serverError.requestId}</code>
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="contact-new-page__form" noValidate={true}>
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
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Contact'}
            </Button>
            <Button variant="default" type="button" onClick={() => navigate('/contacts')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
