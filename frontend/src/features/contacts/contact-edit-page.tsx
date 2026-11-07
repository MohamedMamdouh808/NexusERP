import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { useContact, useUpdateContact } from './use-contacts';
import type { Contact } from '../../services/catalog-service';

const ROLES = ['CUSTOMER', 'SUPPLIER'] as const;
const STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

interface FormErrors {
  code?: string;
  name?: string;
  role?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function ContactEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contactId = id ?? '';
  const { data, isPending, isError, error } = useContact(contactId);
  const updateMutation = useUpdateContact();
  const [form, setForm] = useState({
    code: '',
    name: '',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: '',
    phone: '',
    address: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const contact = data;

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

  if (isError || contact === undefined) {
    return (
      <section className="contact-edit-page" aria-label="Edit contact">
        <PageHeader title="Edit Contact" />
        <Card title="Edit Contact">
          <ErrorState
            message={error instanceof Error ? error.message : 'The contact could not be loaded.'}
          />
        </Card>
      </section>
    );
  }

  setForm((prev) => {
    if (prev.code === '' && contact) {
      return {
        code: contact.code,
        name: contact.name,
        role: contact.role,
        status: contact.status,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
      };
    }
    return prev;
  });

  function validate(): boolean {
    const next: FormErrors = {};
    let valid = true;

    if (!form.code.trim()) {
      next.code = 'Contact code is required.';
      valid = false;
    }

    if (!form.name.trim()) {
      next.name = 'Name is required.';
      valid = false;
    }

    if (!form.role) {
      next.role = 'Role is required.';
      valid = false;
    }

    if (!form.status) {
      next.status = 'Status is required.';
      valid = false;
    }

    if (!form.email.trim()) {
      next.email = 'Email is required.';
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Enter a valid email address.';
      valid = false;
    }

    if (!form.phone.trim()) {
      next.phone = 'Phone is required.';
      valid = false;
    }

    if (!form.address.trim()) {
      next.address = 'Address is required.';
      valid = false;
    }

    setErrors(next);
    return valid;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    if (!validate()) {
      setSubmitting(false);
      return;
    }

    const input = {
      id: contactId,
      code: form.code.trim(),
      name: form.name.trim(),
      role: form.role as Contact['role'],
      status: form.status as Contact['status'],
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    };

    updateMutation.mutate(input, {
      onSuccess: () => {
        navigate(`/contacts/${contactId}`);
      },
      onError: () => {
        setSubmitting(false);
      },
      onSettled: () => {
        setSubmitting(false);
      },
    });
  }

  return (
    <section className="contact-edit-page" aria-label="Edit contact">
      <PageHeader
        title="Edit Contact"
        primaryAction={
          <Button variant="default" onClick={() => navigate(`/contacts/${contactId}`)}>
            Cancel
          </Button>
        }
      />
      <Card title="Edit Contact" description={`Editing “${contact.name}”.`}>
        <form onSubmit={handleSubmit} className="contact-edit-page__form">
          <Input
            id="code"
            label="Contact code *"
            error={errors.code}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            required
            helpText="Unique contact code, e.g. CUST-1001."
          />
          <Input
            id="name"
            label="Name *"
            error={errors.name}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <Select
            id="role"
            label="Role *"
            options={ROLES.map((value) => ({ value, label: value }))}
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            required
          />
          <Select
            id="status"
            label="Status *"
            options={STATUSES.map((value) => ({ value, label: value }))}
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
            required
          />
          <Input
            id="email"
            label="Email *"
            type="email"
            error={errors.email}
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <Input
            id="phone"
            label="Phone *"
            type="tel"
            error={errors.phone}
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            required
          />
          <Input
            id="address"
            label="Address *"
            error={errors.address}
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            required
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-lg)' }}>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || updateMutation.isPending}
              loading={submitting || updateMutation.isPending}
            >
              Save changes
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
