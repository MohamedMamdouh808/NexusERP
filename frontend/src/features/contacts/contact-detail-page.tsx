import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONTACT_PERMISSIONS } from '@nexuserp/shared';

import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  Toast,
} from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { useContact, useArchiveContact, useRestoreContact } from './use-contacts';

export function ContactDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contactId = id ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);
  const session = useSession();
  const canWrite = hasPermission(session, CONTACT_PERMISSIONS.write);

  const { data, isPending, isError, error } = useContact(contactId);
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [dialogError, setDialogError] = useState('');

  const contact = data;
  const archived = contact?.isArchived ?? false;

  // An address is read line by line, not as one comma-joined string: the line
  // breaks are part of an address, and a blob loses them.
  const addressLines = contact
    ? [
        contact.addressLine1,
        contact.addressLine2,
        [contact.postalCode, contact.city].filter(Boolean).join(' '),
        [contact.region, contact.country].filter(Boolean).join(', '),
      ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    : [];

  const roles = contact
    ? [contact.isCustomer ? 'Customer' : null, contact.isSupplier ? 'Supplier' : null].filter(Boolean).join(' & ')
    : '';

  if (isPending) {
    return (
      <section className="contact-detail-page" aria-label="Contact detail">
        <PageHeader title="Contact" />
        <Card title="Contact">
          <Skeleton label="Loading contact" />
        </Card>
      </section>
    );
  }

  if (isError || contact === undefined) {
    return (
      <section className="contact-detail-page" aria-label="Contact detail">
        <PageHeader title="Contact" />
        <Card title="Contact">
          <ErrorState message={error instanceof Error ? error.message : 'The contact could not be loaded.'} />
        </Card>
      </section>
    );
  }

  const undoLatestArchive = () => {
    restoreMutation.mutate(contactId, {
      onSuccess: () => {
        setToasts((items) => [...items, { id: `restore-contact-${Date.now()}`, message: `${contact.name} restored` }]);
      },
      onError: () => setToasts((items) => [...items, { id: `restore-contact-error-${Date.now()}`, message: 'The contact could not be restored.' }]),
    });
  };

  const handleArchive = () => {
    setDialogError('');
    archiveMutation.mutate(contactId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToasts((items) => [...items, { id: `archive-contact-${Date.now()}`, message: `${contact.name} archived` }]);
      },
      onError: (caught) => {
        setDialogError(caught instanceof Error ? caught.message : 'The contact could not be archived.');
      },
    });
  };

  const handleRestore = () => {
    setDialogError('');
    restoreMutation.mutate(contactId, {
      onSuccess: () => {
        setDialogOpen(false);
        navigate('/contacts');
      },
      onError: (caught) => {
        setDialogError(caught instanceof Error ? caught.message : 'The contact could not be restored.');
      },
    });
  };

  return (
    <section className="contact-detail-page" aria-label="Contact detail">
      <PageHeader
        title={contact.name}
        secondaryActions={[
          <div className="contact-detail-page__header-actions" key="contact-actions">
            {canWrite ? (
              <>
                <Button variant="primary" onClick={() => navigate(`/contacts/${contact.id}/edit`)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDialogOpen(true)}
                  disabled={archived && restoreMutation.isPending}
                >
                  {archived ? 'Restore' : 'Archive'}
                </Button>
              </>
            ) : null}
            <Button variant="default" onClick={() => navigate('/contacts')}>
              Back to list
            </Button>
          </div>,
        ]}
      />
      <Card title="Contact details">
        <dl className="contact-detail-page__details">
          <dt>Code</dt>
          <dd>{contact.code}</dd>
          <dt>Roles</dt>
          <dd>{roles}</dd>
          <dt>Status</dt>
          <dd>
            <Badge tone={contact.isArchived ? 'destructive' : 'success'}>{contact.isArchived ? 'Archived' : 'Active'}</Badge>
          </dd>
          <dt>Email</dt>
          <dd>{contact.email ?? '—'}</dd>
          <dt>Phone</dt>
          <dd>{contact.phone ?? '—'}</dd>
          <dt>Address</dt>
          <dd className="contact-detail-page__address-cell">
            {addressLines.length === 0 ? (
              '—'
            ) : (
              <address className="contact-detail-page__address">
                {addressLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </address>
            )}
          </dd>
          <dt>Version</dt>
          <dd>{contact.version}</dd>
        </dl>
      </Card>

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          tone={toast.id.includes('error') ? 'failure' : 'success'}
          message={toast.message}
          actionLabel={toast.id.startsWith('archive-contact-') ? 'Undo' : undefined}
          onAction={toast.id.startsWith('archive-contact-') ? undoLatestArchive : undefined}
          onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))}
        />
      ))}
      <ConfirmDialog
        open={dialogOpen}
        onClose={() => {
          if (!archiveMutation.isPending && !restoreMutation.isPending) {
            setDialogOpen(false);
            setDialogError('');
          }
        }}
        onConfirm={archived ? handleRestore : handleArchive}
        title={archived ? 'Restore contact' : 'Archive contact'}
        description={
          archived
            ? `Are you sure you want to restore “${contact.name}”? The contact will be active again in the directory.`
            : `Are you sure you want to archive “${contact.name}”? Archived contacts are hidden from the directory but can be restored later.`
        }
        actionLabel={archived ? 'Restore' : 'Archive'}
        destructive={!archived}
        loading={archiveMutation.isPending || restoreMutation.isPending}
        error={dialogError}
      />
    </section>
  );
}