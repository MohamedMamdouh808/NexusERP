import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { PageHeader } from '../../components/shell/page-header';
import { Toast, type ToastTone } from '../../components/ui';
import { GeneralCard } from './general-card';
import { ModulesCard } from './modules-card';

/**
 * Organization settings: General and Modules cards (P0-F002).
 *
 * All state comes from the server through the settings/module endpoints and the
 * session; the sample banner and sample service are gone. A save or toggle
 * refreshes the session in place so the top bar and navigation update at once.
 */
export function OrganizationPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [toasts, setToasts] = useState<{ id: string; tone: ToastTone; message: string }[]>([]);

  const notice =
    location.state && typeof location.state === 'object' && 'notice' in location.state
      ? String((location.state as { notice: unknown }).notice)
      : '';

  function toast(message: string, tone: ToastTone = 'success') {
    setToasts((items) => [...items, { id: `settings-${Date.now()}-${items.length}`, tone, message }]);
  }

  return (
    <section className="organization-page" aria-label={t('administration.org.sectionAria')}>
      <PageHeader title={t('administration.org.title')} description={t('administration.org.description')} />
      {notice && <p className="settings-notice" role="status">{notice}</p>}
      <GeneralCard onToast={toast} />
      <ModulesCard onToast={toast} />
      {toasts.map((item) => (
        <Toast
          key={item.id}
          id={item.id}
          tone={item.tone}
          message={item.message}
          onDismiss={() => setToasts((items) => items.filter((t) => t.id !== item.id))}
        />
      ))}
    </section>
  );
}
