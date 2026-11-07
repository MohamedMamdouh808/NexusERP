import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Button, Card, ErrorState, Input, Select } from '../../components/ui';
import { useCreateContact } from './use-contacts';
import type { Contact } from '../../services/catalog-service';

const ROLES = ['CUSTOMER', 'SUPPLIER'] as const;
const STATUSES = ['ACTIVE'] as const;

interface FormErrors {
  code?: string;
  name?: string;
  role?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function ContactNewPage() {
  const navigate = useNavigate();
  const createMutation = useCreateContact();
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
      code: form.code.trim(),
      name: form.name.trim(),
      role: form.role as Contact['role'],
      status: form.status as Contact['status'],
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    };

    createMutation.mutate(input, {
      onSuccess: () => {
        navigate('/contacts');
      },
      onError: () => {
        setSubmitting(false);
      },
      onSettled: () => {
        setSubmitting(false);
      },
    });
  }

  if (createMutation.isError) {
    return (
      <section className="contact-new-page" aria-label="New contact">
        <PageHeader title="New Contact" />
        <Card title="New Contact">
          <ErrorState
            message={
              createMutation.error instanceof Error
                ? createMutation.error.message
                : 'The contact could not be created.'
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section className="contact-new-page" aria-label="New contact">
      <PageHeader
        title="New Contact"
        primaryAction={
          <Button variant="default" onClick={() => navigate('/contacts')}>
            Cancel
          </Button>
        }
      />
      <Card title="New Contact" description="Add a new customer or supplier to the sample directory.">
        <form onSubmit={handleSubmit} className="contact-new-page__form">
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
              disabled={submitting || createMutation.isPending}
              loading={submitting || createMutation.isPending}
            >
              Create Contact
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
