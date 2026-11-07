import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
import { useContact, useArchiveContact, useRestoreContact } from './use-contacts';

export function ContactDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contactId = id ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isPending, isError, error } = useContact(contactId);
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  const contact = data;
  const archived = contact?.status === 'ARCHIVED';

  // A refused action keeps its dialog open with the reason shown in place, so
  // the operator can read why before closing it (fr rule: confirmations that can
  // be refused display the refusal inside the dialog).
  const [dialogError, setDialogError] = useState('');

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
          <ErrorState
            message={error instanceof Error ? error.message : 'The contact could not be loaded.'}
          />
        </Card>
      </section>
    );
  }

  const undoLatestArchive = () => {
    restoreMutation.mutate(contactId, {
      onSuccess: () => {
        setToasts((items) => [...items, { id: `restore-contact-${Date.now()}`, message: `${contact?.name ?? 'Contact'} restored` }]);
      },
      onError: () => setToasts((items) => [...items, { id: `restore-contact-error-${Date.now()}`, message: 'The contact could not be restored.' }]),
    });
  };

  const handleArchive = () => {
    setDialogError('');
    archiveMutation.mutate(contactId, {
      onSuccess: () => {
        setDialogOpen(false);
        const toastId = `archive-contact-${Date.now()}`;
        setToasts((items) => [...items, { id: toastId, message: `${contact?.name ?? 'Contact'} archived` }]);
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
            <Button variant="primary" onClick={() => navigate(`/contacts/${contact.id}/edit`)}>
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => setDialogOpen(true)}
              disabled={archived}
              reason={archived ? 'Already archived' : undefined}
            >
              {archived ? 'Restore' : 'Archive'}
            </Button>
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
          <dt>Role</dt>
          <dd>
            <Badge tone={contact.role === 'CUSTOMER' ? 'success' : 'info'}>{contact.role}</Badge>
          </dd>
          <dt>Status</dt>
          <dd>
            <Badge tone={contact.status === 'ACTIVE' ? 'success' : 'destructive'}>
              {contact.status}
            </Badge>
          </dd>
          <dt>Email</dt>
          <dd>{contact.email}</dd>
          <dt>Phone</dt>
          <dd>{contact.phone}</dd>
          <dt>Address</dt>
          <dd>{contact.address}</dd>
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
