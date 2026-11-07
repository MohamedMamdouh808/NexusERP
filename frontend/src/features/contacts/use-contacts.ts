import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { Contact, ContactQuery } from '../../services/catalog-service';

export function useContacts(query: ContactQuery) {
  return useQuery({
    queryKey: ['contacts', query],
    queryFn: () => sampleCatalogService.listContacts(query),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => sampleCatalogService.getContact(id),
    enabled: id !== undefined,
  });
}

export function useCreateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Contact, 'id'>) => sampleCatalogService.createContact(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Contact) => sampleCatalogService.updateContact(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useArchiveContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.archiveContact({ id }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useRestoreContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.restoreContact({ id }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
