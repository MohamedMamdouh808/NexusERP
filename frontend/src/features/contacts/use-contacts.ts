import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as contactsClient from '../../services/contacts-client';
import type { Contact, CreateContactInput, UpdateContactInput, ListContactsParams } from '../../services/contacts-client';

export type { Contact, CreateContactInput, UpdateContactInput };

function toError(failure: { code: string; message: string; requestId: string }): Error {
  const err = new Error(failure.message);
  (err as Error & { code?: string; requestId?: string }).code = failure.code;
  (err as Error & { code?: string; requestId?: string }).requestId = failure.requestId;
  return err;
}

export function useContacts(params: ListContactsParams) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => {
      const res = await contactsClient.listContacts(params);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: async () => {
      const res = await contactsClient.getContact(id);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const res = await contactsClient.createContact(input);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateContactInput }) => {
      const res = await contactsClient.updateContact(id, input);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useArchiveContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await contactsClient.archiveContact(id);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useRestoreContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await contactsClient.restoreContact(id);
      if (!res.ok) throw toError(res.failure);
      return res.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}