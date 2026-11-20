import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
    ? [contact.isCustomer ? t('contacts.form.roleCustomer') : null, contact.isSupplier ? t('contacts.form.roleSupplier') : null]
        .filter(Boolean)
        .join(' & ')
    : '';

  if (isPending) {
    return (
      <section className="contact-detail-page" aria-label={t('contacts.detail.title')}>
        <PageHeader title={t('contacts.detail.pageTitle')} />
        <Card title={t('contacts.detail.pageTitle')}>
          <Skeleton label={t('contacts.detail.loading')} />
        </Card>
      </section>
    );
  }

  if (isError || contact === undefined) {
    return (
      <section className="contact-detail-page" aria-label={t('contacts.detail.title')}>
        <PageHeader title={t('contacts.detail.pageTitle')} />
        <Card title={t('contacts.detail.pageTitle')}>
          <ErrorState message={error instanceof Error ? error.message : t('contacts.detail.loadError')} />
        </Card>
      </section>
    );
  }

  const undoLatestArchive = () => {
    restoreMutation.mutate(contactId, {
      onSuccess: () => {
        setToasts((items) => [...items, { id: `restore-contact-${Date.now()}`, message: t('contacts.form.restoredToast', { name: contact.name }) }]);
      },
      onError: () => setToasts((items) => [...items, { id: `restore-contact-error-${Date.now()}`, message: t('contacts.detail.restoreError') }]),
    });
  };

  const handleArchive = () => {
    setDialogError('');
    archiveMutation.mutate(contactId, {
      onSuccess: () => {
        setDialogOpen(false);
        setToasts((items) => [...items, { id: `archive-contact-${Date.now()}`, message: t('contacts.form.archivedToast', { name: contact.name }) }]);
      },
      onError: (caught) => {
        setDialogError(caught instanceof Error ? caught.message : t('contacts.detail.archiveError'));
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
        setDialogError(caught instanceof Error ? caught.message : t('contacts.detail.restoreError'));
      },
    });
  };

  return (
    <section className="contact-detail-page" aria-label={t('contacts.detail.title')}>
      <PageHeader
        title={contact.name}
        secondaryActions={[
          <div className="contact-detail-page__header-actions" key="contact-actions">
            {canWrite ? (
              <>
                <Button variant="primary" onClick={() => navigate(`/contacts/${contact.id}/edit`)}>
                  {t('contacts.detail.edit')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDialogOpen(true)}
                  disabled={archived && restoreMutation.isPending}
                >
                  {archived ? t('contacts.detail.restore') : t('contacts.detail.archive')}
                </Button>
              </>
            ) : null}
            <Button variant="default" onClick={() => navigate('/contacts')}>
              {t('contacts.detail.backToList')}
            </Button>
          </div>,
        ]}
      />
      <Card title={t('contacts.detail.title')}>
        <dl className="contact-detail-page__details">
          <dt>{t('contacts.detail.code')}</dt>
          <dd>{contact.code}</dd>
          <dt>{t('contacts.detail.role')}</dt>
          <dd>{roles}</dd>
          <dt>{t('contacts.detail.status')}</dt>
          <dd>
            <Badge tone={contact.isArchived ? 'destructive' : 'success'}>{contact.isArchived ? t('common.status.archived') : t('common.status.active')}</Badge>
          </dd>
          <dt>{t('contacts.detail.email')}</dt>
          <dd>{contact.email ?? '—'}</dd>
          <dt>{t('contacts.detail.phone')}</dt>
          <dd>{contact.phone ?? '—'}</dd>
          <dt>{t('contacts.detail.address')}</dt>
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
          <dt>{t('contacts.detail.version')}</dt>
          <dd>{contact.version}</dd>
        </dl>
      </Card>

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          tone={toast.id.includes('error') ? 'failure' : 'success'}
          message={toast.message}
          actionLabel={toast.id.startsWith('archive-contact-') ? t('contacts.detail.undo') : undefined}
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
        title={archived ? t('contacts.detail.restoreTitle') : t('contacts.detail.archiveTitle')}
        description={
          archived
            ? t('contacts.detail.restoreDescription', { name: contact.name })
            : t('contacts.detail.archiveDescription', { name: contact.name })
        }
        actionLabel={archived ? t('contacts.detail.restoreLabel') : t('contacts.detail.archiveLabel')}
        destructive={!archived}
        loading={archiveMutation.isPending || restoreMutation.isPending}
        error={dialogError}
      />
    </section>
  );
}
