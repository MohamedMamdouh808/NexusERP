import { useQuery } from '@tanstack/react-query';

import { sampleCatalogService } from '../../services/sample-catalog-service';
import type { DashboardPeriod } from '../../services/catalog-service';

export function useDashboard(period: DashboardPeriod) {
  return useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => sampleCatalogService.getDashboardSummary(period),
  });
}
