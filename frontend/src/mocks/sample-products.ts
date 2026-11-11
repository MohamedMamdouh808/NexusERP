import type { DecimalString } from '@nexuserp/shared';

/**
 * The sample products.
 *
 * The products themselves are REAL now: the catalogue is served by the service,
 * and the product screens read it. These records stay only for the modules that
 * are still demonstration modules - the sales order, the purchase order and the
 * command palette - which must not call the real product service: their own
 * documents are demonstration documents, and a real product in a demonstration
 * order would be a record that does not belong to anything.
 *
 * Money stays in decimal-string form throughout (FR-039).
 */
export interface SampleProduct {
  readonly id: string;
  /** Stock-keeping unit. */
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly unitOfMeasure: string;
  readonly purchasePrice: DecimalString;
  readonly sellingPrice: DecimalString;
  /** Optional reorder threshold. */
  readonly lowStockThreshold: DecimalString | null;
  readonly status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  {
    id: 'prod-0001',
    sku: 'SKU-1001',
    name: 'Heavy-duty shelving unit',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '850.00',
    sellingPrice: '1250.00',
    lowStockThreshold: '5',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0002',
    sku: 'SKU-1002',
    name: 'Pallet wrapping film',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '260.00',
    sellingPrice: '384.50',
    lowStockThreshold: '10',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0003',
    sku: 'SKU-1003',
    name: 'Barcode scanner, cordless',
    category: 'Equipment',
    unitOfMeasure: 'each',
    purchasePrice: '1499.00',
    sellingPrice: '2199.99',
    lowStockThreshold: '3',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0004',
    sku: 'SKU-1004',
    name: 'Thermal label roll',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '65.00',
    sellingPrice: '96.00',
    lowStockThreshold: '20',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0005',
    sku: 'SKU-1005',
    name: 'Forklift hire, one week',
    category: 'Services',
    unitOfMeasure: 'week',
    purchasePrice: '1350.00',
    sellingPrice: '1875.00',
    lowStockThreshold: null,
    status: 'DRAFT',
  },
  {
    id: 'prod-0006',
    sku: 'SKU-1006',
    name: 'Steel pallet, galvanised',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '2950.00',
    sellingPrice: '4300.00',
    lowStockThreshold: '8',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0007',
    sku: 'SKU-1007',
    name: 'Safety glove, cut-resistant',
    category: 'PPE',
    unitOfMeasure: 'pair',
    purchasePrice: '420.00',
    sellingPrice: '612.75',
    lowStockThreshold: '15',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0008',
    sku: 'SKU-1008',
    name: 'Racking inspection service',
    category: 'Services',
    unitOfMeasure: 'visit',
    purchasePrice: '520.00',
    sellingPrice: '780.40',
    lowStockThreshold: null,
    status: 'ARCHIVED',
  },
  {
    id: 'prod-0009',
    sku: 'SKU-1009',
    name: 'Obsolete stock write-off',
    category: 'General',
    unitOfMeasure: 'each',
    purchasePrice: '0.00',
    sellingPrice: '0.00',
    lowStockThreshold: null,
    status: 'ARCHIVED',
  },
  {
    id: 'prod-0010',
    sku: 'SKU-1010',
    name: 'Wooden pallet collar',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '95.00',
    sellingPrice: '145.20',
    lowStockThreshold: '12',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0011',
    sku: 'SKU-1011',
    name: 'Reserved: dispatch crate',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '220.00',
    sellingPrice: '308.00',
    lowStockThreshold: '6',
    status: 'DRAFT',
  },
  {
    id: 'prod-0012',
    sku: 'SKU-1012',
    name: 'Consumed: packing tape',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '38.00',
    sellingPrice: '57.85',
    lowStockThreshold: '25',
    status: 'ARCHIVED',
  },
];
