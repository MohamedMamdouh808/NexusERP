import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { Product, ProductQuery } from '../../services/catalog-service';

export function useProducts(query: ProductQuery) {
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => sampleCatalogService.listProducts(query),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => sampleCatalogService.getProduct(id),
    enabled: id !== undefined,
  });
}

export function useCreateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Product, 'id'>) => sampleCatalogService.createProduct(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Product) => sampleCatalogService.updateProduct(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useArchiveProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sampleCatalogService.archiveProduct({ id }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
