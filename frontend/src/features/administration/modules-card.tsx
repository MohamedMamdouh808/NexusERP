import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, ConfirmDialog } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import { useOrganizationModules, useToggleOrganizationModule } from './use-organization-modules';
import type { ModuleSetting } from '../../services/organization-client';

type Detail = { field?: string; message?: string };

export function ModulesCard({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const session = useSession();
  const modules = useOrganizationModules();
  const toggle = useToggleOrganizationModule();
  const [target, setTarget] = useState<ModuleSetting | null>(null);
  const [staleFor, setStaleFor] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState('');

  const canManage =
    session.status === 'signed-in' && hasPermission(session, 'settings.manage');

  function change(module: ModuleSetting, enabled: boolean) {
    setModuleError('');
    setStaleFor(null);
    toggle.mutate(
      { key: module.key, enabled, version: module.version },
      {
        onSuccess: () => {
          onToast(t(enabled ? 'administration.org.turnedOnToast' : 'administration.org.turnedOffToast', {
            label: t(`administration.org.moduleLabels.${module.key}`),
          }));
          setTarget(null);
        },
        onError: (error) => {
          const err = error as Error & { code?: string; details?: Detail[] };
          const details = err.details ?? [];
          if (err.code === 'STALE_VERSION') setStaleFor(module.key);
          else if (err.code === 'MODULE_DEPENDENCY') {
            setModuleError(details.map((d) => d.message ?? '').filter(Boolean).join(' ') || err.message);
          } else if (err.code === 'MODULE_IN_USE') {
            setModuleError(t('administration.org.inUseReason', { counts: details.map((d) => d.message ?? '').filter(Boolean).join(' ') }));
          } else setModuleError(err.message);
        },
      },
    );
  }

  if (modules.isPending) {
    return <Card title={t('administration.org.modulesTitle')}><p>{t('administration.org.loading')}</p></Card>;
  }
  if (modules.isError || !modules.data) {
    return (
      <Card title={t('administration.org.modulesTitle')}>
        <p role="alert">{t('administration.org.loadError')}</p>
        <Button onClick={() => void modules.refetch()}>{t('administration.org.reload')}</Button>
      </Card>
    );
  }

  return (
    <Card
      title={t('administration.org.modulesTitle')}
      description={t('administration.org.modulesDescription')}
    >
      <p className="server-enforced-note">{t('administration.org.serverEnforced')}</p>
      {!canManage && <p className="form-help-text">{t('administration.org.readOnly')}</p>}
      {moduleError && <p className="module-inline-error" role="alert">{moduleError}</p>}
      <div className="table-container">
        <table className="data-table module-table">
          <thead>
            <tr>
              <th>{t('administration.org.moduleColumn')}</th>
              <th>{t('administration.org.descriptionColumn')}</th>
              <th>{t('administration.org.statusColumn')}</th>
              <th>{t('administration.org.availabilityColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {modules.data.map((module) => {
              const label = t(`administration.org.moduleLabels.${module.key}`);
              const description = t(`administration.org.moduleDescriptions.${module.key}`);
              return (
                <tr key={module.key}>
                  <td>{label}</td>
                  <td>{description}</td>
                  <td>
                    <Badge tone={module.enabled ? 'success' : 'neutral'}>
                      {module.enabled ? t('administration.org.on') : t('administration.org.off')}
                    </Badge>
                  </td>
                  <td>
                    {module.locked ? (
                      <span>{t('administration.org.lockedOn')}</span>
                    ) : (
                      <label className="module-switch">
                        <span>{module.enabled ? t('administration.org.enabled') : t('administration.org.disabled')}</span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={t(module.enabled ? 'administration.org.turnOffAria' : 'administration.org.turnOnAria', { label })}
                          checked={module.enabled}
                          disabled={!canManage || toggle.isPending}
                          onChange={() => {
                            setModuleError('');
                            if (module.enabled) setTarget(module);
                            else change(module, true);
                          }}
                        />
                      </label>
                    )}
                    {staleFor === module.key && (
                      <span className="stale-prompt" role="alert">
                        {t('administration.org.staleVersion')}{' '}
                        <Button onClick={() => { void modules.refetch(); setStaleFor(null); }}>
                          {t('administration.org.reload')}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={target !== null}
        onClose={() => { if (!toggle.isPending) { setTarget(null); setModuleError(''); } }}
        onConfirm={() => { if (target) change(target, false); }}
        title={t('administration.org.turnOffTitle', { module: target ? t(`administration.org.moduleLabels.${target.key}`) : t('administration.org.turnOffFallback') })}
        description={t('administration.org.turnOffDescription')}
        actionLabel={t('administration.org.turnOffAction')}
        destructive
        loading={toggle.isPending}
        error={moduleError || undefined}
      />
    </Card>
  );
}
