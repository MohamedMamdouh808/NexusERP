import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bootstrapSession } from '../../services/auth-session';
import {
  getOrganizationModules,
  toggleOrganizationModule,
  type ToggleModuleInput,
} from '../../services/organization-client';

const key = ['modules'] as const;

export function useOrganizationModules() {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await getOrganizationModules();
      if (!result.ok) throw new Error(result.failure.message);
      return result.data.modules;
    },
  });
}

export function useToggleOrganizationModule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ToggleModuleInput) => {
      const result = await toggleOrganizationModule(input);
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
      void client.invalidateQueries({ queryKey: ['organization-settings'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void bootstrapSession(true);
    },
  });
}
