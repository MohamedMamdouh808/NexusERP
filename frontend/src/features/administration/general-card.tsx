import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '@nexuserp/shared';

import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { hasPermission, useSession } from '../../services/auth-session';
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
} from './use-organization-settings';
import type { OrganizationSettings } from '../../services/organization-client';

type FormValues = {
  name: string;
  currencyCode: string;
  defaultPaymentTermsDays: number;
  version: number;
};

export function GeneralCard({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const session = useSession();
  const settings = useOrganizationSettings();
  const update = useUpdateOrganizationSettings();
  const [stale, setStale] = useState(false);

  const canManage =
    session.status === 'signed-in' && hasPermission(session, 'settings.manage');

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('administration.org.nameRequired')).max(100),
        currencyCode: z.string().refine(
          (code) => SUPPORTED_CURRENCIES.some((c) => c === code),
          t('administration.org.chooseCurrency'),
        ),
        defaultPaymentTermsDays: z.coerce
          .number()
          .int(t('administration.org.termsWhole'))
          .min(0, t('administration.org.termsNonNegative'))
          .max(365, t('administration.org.termsMax')),
        version: z.coerce.number().int().min(1),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<FormValues>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { name: '', currencyCode: DEFAULT_CURRENCY, defaultPaymentTermsDays: 30, version: 1 },
  });

  function apply(data: OrganizationSettings) {
    reset({
      name: data.name,
      currencyCode: data.currencyCode,
      defaultPaymentTermsDays: data.defaultPaymentTermsDays,
      version: data.version,
    });
    setStale(false);
  }

  useEffect(() => {
    if (settings.data) apply(settings.data);
  }, [settings.data]);

  const onSubmit = handleSubmit((values) => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'currencyCode' || field === 'defaultPaymentTermsDays') {
          setFieldError(field, { type: 'zod', message: issue.message });
        }
      }
      return;
    }
    setStale(false);
    update.mutate(parsed.data, {
      onSuccess: (result) => {
        apply(result);
        onToast(t('administration.org.savedToast', { name: result.name }));
      },
      onError: (error) => {
        const code = (error as Error & { code?: string }).code;
        if (code === 'STALE_VERSION') {
          setStale(true);
        } else {
          onToast(error instanceof Error ? error.message : t('administration.org.saveFailed'));
        }
      },
    });
  });

  if (settings.isPending) {
    return (
      <Card title={t('administration.org.general')}>
        <p>{t('administration.org.loading')}</p>
      </Card>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <Card title={t('administration.org.general')}>
        <p role="alert">{t('administration.org.loadError')}</p>
        <Button onClick={() => void settings.refetch()}>{t('administration.org.reload')}</Button>
      </Card>
    );
  }

  return (
    <Card
      title={t('administration.org.general')}
      description={t('administration.org.generalDescription')}
    >
      <p className="server-enforced-note">{t('administration.org.serverEnforced')}</p>
      {!canManage && <p className="form-help-text">{t('administration.org.readOnly')}</p>}
      {stale && (
        <div className="stale-prompt" role="alert">
          <span>{t('administration.org.staleVersion')}</span>
          <Button
            onClick={() => {
              void settings.refetch().then((result) => {
                if (result.data) apply(result.data);
              });
              void update.reset();
            }}
          >
            {t('administration.org.reload')}
          </Button>
        </div>
      )}
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="settings-fields">
          <Input
            id="org-name"
            label={t('administration.org.name')}
            required
            disabled={!canManage || update.isPending}
            {...register('name')}
            error={errors.name?.message}
          />
          <Select
            id="org-currency"
            label={t('administration.org.currency')}
            options={SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code }))}
            disabled={!canManage || update.isPending || settings.data.currencyLocked}
            helpText={
              settings.data.currencyLocked
                ? t('administration.org.currencyLockedNote')
                : t('administration.org.currencyHelp')
            }
            {...register('currencyCode')}
            error={errors.currencyCode?.message}
          />
          <Input
            id="org-terms"
            label={t('administration.org.terms')}
            type="number"
            min={0}
            max={365}
            step={1}
            required
            disabled={!canManage || update.isPending}
            {...register('defaultPaymentTermsDays', { valueAsNumber: true })}
            error={errors.defaultPaymentTermsDays?.message}
          />
        </div>
        <p className="form-help-text">{t('administration.org.appliesNote')}</p>
        <p className="settings-version">
          <Badge tone="neutral">{t('administration.org.version')} {settings.data.version}</Badge>
        </p>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!canManage}>
          {t('administration.org.saveSettings')}
        </Button>
      </form>
    </Card>
  );
}
