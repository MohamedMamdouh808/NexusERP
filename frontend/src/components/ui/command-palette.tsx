import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sampleCatalogService } from '../../services/sample-catalog-service';
import { NAVIGATION } from '../shell/navigation';
import { Input } from './index';
import { Icon } from './icon';

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly keywords: readonly string[];
  readonly run: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = 'command-palette-results';
  const normalized = query.trim().toLowerCase();
  const searching = normalized.length >= 2;

  const products = useQuery({ queryKey: ['command-palette', 'products', normalized], queryFn: () => sampleCatalogService.listProducts({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });
  const contacts = useQuery({ queryKey: ['command-palette', 'contacts', normalized], queryFn: () => sampleCatalogService.listContacts({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });
  const orders = useQuery({ queryKey: ['command-palette', 'purchase-orders', normalized], queryFn: () => sampleCatalogService.listPurchaseOrders({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });
  const salesOrders = useQuery({ queryKey: ['command-palette', 'sales-orders', normalized], queryFn: () => sampleCatalogService.listSalesOrders({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });
  const invoices = useQuery({ queryKey: ['command-palette', 'invoices', normalized], queryFn: () => sampleCatalogService.listInvoices({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });
  const payments = useQuery({ queryKey: ['command-palette', 'payments', normalized], queryFn: () => sampleCatalogService.listPayments({ search: normalized, page: 1, pageSize: 5 }), enabled: searching });

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => onClose(), [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const items = useMemo<readonly CommandItem[]>(() => {
    const nav = NAVIGATION.flatMap((group) =>
      group.entries
        .filter((entry) => entry.state === 'available' && entry.path)
        .map((entry) => ({
          id: `nav-${entry.path}`,
          label: entry.label,
          hint: 'Page',
          keywords: [entry.label, group.name, entry.permission ?? ''],
          run: () => navigate(entry.path!),
        })),
    );

    const commands: CommandItem[] = [
      { id: 'new-product', label: 'Create product', hint: 'Command', keywords: ['new product', 'catalogue', 'add product'], run: () => navigate('/products/new') },
      { id: 'new-contact', label: 'Create contact', hint: 'Command', keywords: ['new contact', 'customer', 'supplier'], run: () => navigate('/contacts/new') },
      { id: 'new-order', label: 'Create purchase order', hint: 'Command', keywords: ['purchase order', 'buy'], run: () => navigate('/purchasing/new') },
      { id: 'new-sales-order', label: 'Create sales order', hint: 'Command', keywords: ['sales order', 'sell'], run: () => navigate('/sales/new') },
      { id: 'new-invoice', label: 'Create invoice', hint: 'Command', keywords: ['invoice', 'bill'], run: () => navigate('/invoicing') },
      { id: 'new-payment', label: 'Record payment', hint: 'Command', keywords: ['payment', 'pay', 'collect'], run: () => navigate('/invoicing/payments/new') },
    ];

    if (!searching) return [...commands, ...nav];

    const records: CommandItem[] = [
      ...(products.data?.items ?? []).map((item) => ({ id: `product-${item.id}`, label: item.name, hint: `Product · ${item.sku}`, keywords: [item.sku, item.name, item.category], run: () => navigate(`/products/${item.id}`) })),
      ...(contacts.data?.items ?? []).map((item) => ({ id: `contact-${item.id}`, label: item.name, hint: `${item.role} · ${item.code}`, keywords: [item.code, item.name, item.email, item.phone], run: () => navigate(`/contacts/${item.id}`) })),
      ...(orders.data?.items ?? []).map((item) => ({ id: `po-${item.id}`, label: item.number ?? 'Purchase order', hint: `Purchase order · ${item.supplierName}`, keywords: [item.number, item.supplierName, item.status], run: () => navigate(`/purchasing/${item.id}`) })),
      ...(salesOrders.data?.items ?? []).map((item) => ({ id: `so-${item.id}`, label: item.number ?? 'Sales order', hint: `Sales order · ${item.customerName}`, keywords: [item.number, item.customerName, item.status], run: () => navigate(`/sales/${item.id}`) })),
      ...(invoices.data?.items ?? []).map((item) => ({ id: `invoice-${item.id}`, label: item.number ?? 'Draft invoice', hint: `Invoice · ${item.customerName}`, keywords: [item.number ?? '', item.customerName, item.status], run: () => navigate(`/invoicing/${item.id}`) })),
      ...(payments.data?.items ?? []).map((item) => ({ id: `payment-${item.id}`, label: item.number, hint: `Payment · ${item.customerName}`, keywords: [item.number, item.customerName, item.status, item.method], run: () => navigate(`/invoicing/payments/${item.id}`) })),
    ];
    return [...commands, ...nav, ...records].filter((item) => {
      const text = [item.label, item.hint, ...item.keywords].join(' ').toLowerCase();
      return normalized.split(/\s+/).filter(Boolean).every((word) => text.includes(word));
    });
  }, [contacts.data?.items, invoices.data?.items, navigate, normalized, orders.data?.items, payments.data?.items, products.data?.items, salesOrders.data?.items, searching]);

  const visible = items.slice(0, 12);
  const selectedIndex = visible.length === 0 ? 0 : Math.min(selected, visible.length - 1);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="command-palette__backdrop" aria-label="Close command palette" onClick={onClose} />
      <div className="command-palette__panel">
        <Input
          ref={inputRef}
          id="command-palette-input"
          label="Search NexusERP"
          value={query}
          placeholder="Search records, pages or commands…"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={visible[selectedIndex]?.id}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Home') {
              event.preventDefault();
              setSelected(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              setSelected(Math.max(visible.length - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(visible[selectedIndex]);
            }
          }}
        />
        <div className="command-palette__results" role="listbox" id={listId} aria-label="Results">
          {visible.length === 0 ? (
            <p className="command-palette__empty">No matches. Try a record number, customer, product or page.</p>
          ) : (
            visible.map((item, index) => (
              <button
                key={item.id}
                id={item.id}
                type="button"
                className={index === selectedIndex ? 'command-palette__item command-palette__item--selected' : 'command-palette__item'}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setSelected(index)}
                onClick={() => run(item)}
              >
                <Icon name={index === selectedIndex ? 'chevronRight' : 'search'} />
                <span className="command-palette__label">{item.label}</span>
                <span className="command-palette__hint">{item.hint}</span>
              </button>
            ))
          )}
        </div>
        <p className="command-palette__footer"><span><kbd>Enter</kbd> open</span><span><kbd>↑↓</kbd> navigate</span><span><kbd>Esc</kbd> close</span></p>
      </div>
    </div>
  );
}
