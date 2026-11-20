import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bootstrapSession } from '../../services/auth-session';
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  type UpdateOrganizationSettingsInput,
} from '../../services/organization-client';

const key = ['organization-settings'] as const;

export function useOrganizationSettings() {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await getOrganizationSettings();
      if (!result.ok) throw new Error(result.failure.message);
      return result.data;
    },
  });
}

export function useUpdateOrganizationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationSettingsInput) => {
      const result = await updateOrganizationSettings(input);
      if (!result.ok) {
        const error = new Error(result.failure.message) as Error & {
          code: string;
          details: unknown;
        };
        error.code = result.failure.code;
        error.details = result.failure.details;
        throw error;
      }
      return result.data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ['modules'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void bootstrapSession(true);
    },
  });
}
