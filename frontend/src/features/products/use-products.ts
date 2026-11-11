import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as productsClient from '../../services/products-client';
import type {
  CreateProductInput,
  ListProductsParams,
  Product,
  ProductCategory,
  UnitOfMeasure,
  UpdateProductInput,
} from '../../services/products-client';

export type { CreateProductInput, Product, ProductCategory, UnitOfMeasure, UpdateProductInput };

/** Turns the service's failure envelope into the error the screens show. */
function toError(failure: { code: string; message: string; requestId: string; details?: unknown }): Error {
  const error = new Error(failure.message);
  const enriched = error as Error & { code?: string; requestId?: string; details?: unknown };
  enriched.code = failure.code;
  enriched.requestId = failure.requestId;
  enriched.details = failure.details;
  return enriched;
}

export function useProducts(params: ListProductsParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      const result = await productsClient.listProducts(params);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => {
      const result = await productsClient.getProduct(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    enabled: id !== '' && id !== undefined,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const result = await productsClient.listCategories();
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useUnits() {
  return useQuery({
    queryKey: ['units-of-measure'],
    queryFn: async () => {
      const result = await productsClient.listUnits();
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
  });
}

export function useCreateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const result = await productsClient.createProduct(input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
      client.invalidateQueries({ queryKey: ['product-categories'] });
      client.invalidateQueries({ queryKey: ['units-of-measure'] });
    },
  });
}

export function useUpdateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProductInput }) => {
      const result = await productsClient.updateProduct(id, input);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useArchiveProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await productsClient.archiveProduct(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useRestoreProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await productsClient.restoreProduct(id);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const result = await productsClient.createCategory(name);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['product-categories'] });
    },
  });
}

export function useCreateUnit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, abbreviation }: { name: string; abbreviation: string }) => {
      const result = await productsClient.createUnit(name, abbreviation);
      if (!result.ok) throw toError(result.failure);
      return result.data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['units-of-measure'] });
    },
  });
}
