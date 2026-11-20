import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { listSalesOrders } from '../../services/sales-client';
import { listPurchaseOrders } from '../../services/purchasing-client';
import { listProducts } from '../../services/products-client';
import { listContacts, type Contact } from '../../services/contacts-client';
import { listInvoices, listPayments } from '../../services/invoicing-client';
import { NAVIGATION, NAV_LABEL_KEYS, GROUP_LABEL_KEYS } from '../shell/navigation';
import { Input } from './index';
import { Icon } from './icon';

/** The role a contact holds, in the words the interface uses elsewhere. */
function contactRoleLabel(contact: Contact, t: TFunction): string {
  if (contact.isCustomer && contact.isSupplier) return t('ui.palette.roleCustomerAndSupplier');
  return contact.isCustomer ? t('ui.palette.roleCustomer') : t('ui.palette.roleSupplier');
}

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
  const { t } = useTranslation();
  const searching = normalized.length >= 2;

  // The palette searches the real domains for the real records (contacts,
  // products, purchase orders) and the demonstration modules for their own
  // demonstration records. A product result is a real product, so it opens the
  // real catalogue.
  const products = useQuery({
    queryKey: ['command-palette', 'products', normalized],
    queryFn: async () => {
      const result = await listProducts({ search: normalized, page: 1, pageSize: 5 });
      if (!result.ok) return [];
      return result.data.items;
    },
    enabled: searching,
  });
  // Contacts are a REAL domain now, so the palette searches the real service.
  // A palette result that pointed at a mock contact would send the user to a
  // record that does not exist.
  const contacts = useQuery({
    queryKey: ['command-palette', 'contacts', normalized],
    queryFn: async () => {
      const result = await listContacts({ search: normalized, page: 1, pageSize: 5 });
      // A palette search that fails shows no contacts - it does not raise an
      // error state over a quick-jump palette, and it does not keep retrying.
      return result.ok ? result.data : { items: [], total: 0, page: 1, pageSize: 5 };
    },
    enabled: searching,
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['command-palette', 'purchase-orders', normalized],
    queryFn: async () => {
      const result = await listPurchaseOrders({ search: normalized, page: 1, pageSize: 5 });
      // A palette search that fails shows no orders - it does not raise an
      // error state over a quick-jump palette, and it does not keep retrying.
      if (!result.ok) return { items: [], total: 0, page: 1, pageSize: 5 };
      return result.data;
    },
    enabled: searching,
    retry: false,
  });
  const salesOrders = useQuery({
    queryKey: ['command-palette', 'sales-orders', normalized],
    queryFn: async () => {
      const result = await listSalesOrders({ search: normalized, page: 1, pageSize: 5 });
      return result.ok ? result.data : { items: [], total: 0, page: 1, pageSize: 5 };
    },
    enabled: searching,
    retry: false,
  });
  // Invoices and payments are REAL domains now, so the palette searches the real
  // service; a search that fails shows nothing rather than a sample row.
  const invoices = useQuery({
    queryKey: ['command-palette', 'invoices', normalized],
    queryFn: async () => {
      const result = await listInvoices({ search: normalized, page: 1, pageSize: 5 });
      if (!result.ok) return { items: [], total: 0, page: 1, pageSize: 5, outstanding: '0.00', overdue: '0.00' };
      return result.data;
    },
    enabled: searching,
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['command-palette', 'payments', normalized],
    queryFn: async () => {
      const result = await listPayments({ search: normalized, page: 1, pageSize: 5 });
      if (!result.ok) return { items: [], total: 0, page: 1, pageSize: 5 };
      return result.data;
    },
    enabled: searching,
    retry: false,
  });

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
          label: NAV_LABEL_KEYS[entry.label] !== undefined ? t(`shell.sidebar.entries.${NAV_LABEL_KEYS[entry.label]}`) : entry.label,
          hint: t('ui.palette.page'),
          keywords: [
            entry.label,
            NAV_LABEL_KEYS[entry.label] !== undefined ? t(`shell.sidebar.entries.${NAV_LABEL_KEYS[entry.label]}`) : entry.label,
            GROUP_LABEL_KEYS[entry.group] !== undefined ? t(`shell.sidebar.groups.${GROUP_LABEL_KEYS[entry.group]}`) : entry.group,
            entry.permission ?? '',
          ],
          run: () => navigate(entry.path!),
        })),
    );

    const commands: CommandItem[] = [
      { id: 'new-product', label: t('ui.palette.createProduct'), hint: t('ui.palette.command'), keywords: ['new product', 'catalogue', 'add product', 'منتج', 'إنشاء منتج'], run: () => navigate('/products/new') },
      { id: 'new-contact', label: t('ui.palette.createContact'), hint: t('ui.palette.command'), keywords: ['new contact', 'customer', 'supplier', 'جهة اتصال', 'عميل', 'مورد'], run: () => navigate('/contacts/new') },
      { id: 'new-order', label: t('ui.palette.createPurchaseOrder'), hint: t('ui.palette.command'), keywords: ['purchase order', 'buy', 'أمر شراء', 'شراء'], run: () => navigate('/purchasing/new') },
      { id: 'new-sales-order', label: t('ui.palette.createSalesOrder'), hint: t('ui.palette.command'), keywords: ['sales order', 'sell', 'أمر بيع', 'بيع'], run: () => navigate('/sales/new') },
      { id: 'new-invoice', label: t('ui.palette.createInvoice'), hint: t('ui.palette.command'), keywords: ['invoice', 'bill', 'فاتورة'], run: () => navigate('/invoicing') },
      { id: 'new-payment', label: t('ui.palette.recordPayment'), hint: t('ui.palette.command'), keywords: ['payment', 'pay', 'collect', 'دفعة', 'تحصيل'], run: () => navigate('/invoicing/payments/new') },
    ];

    if (!searching) return [...commands, ...nav];

    const records: CommandItem[] = [
      ...(products.data ?? []).map((item) => ({ id: `product-${item.id}`, label: item.name, hint: `${t('shell.sidebar.entries.Products')} • ${item.sku}`, keywords: [item.sku, item.name], run: () => navigate(`/products/${item.id}`) })),
      ...(contacts.data?.items ?? []).map((item) => ({ id: `contact-${item.id}`, label: item.name, hint: `${contactRoleLabel(item, t)} • ${item.code}`, keywords: [item.code, item.name, item.email ?? '', item.phone ?? ''], run: () => navigate(`/contacts/${item.id}`) })),
      ...(orders.data?.items ?? []).map((item) => ({ id: `po-${item.id}`, label: item.number ?? t('ui.palette.purchaseOrder'), hint: `${t('shell.sidebar.entries.Purchasing')} • ${item.supplierName}`, keywords: [item.number, item.supplierName, item.status], run: () => navigate(`/purchasing/${item.id}`) })),
      ...(salesOrders.data?.items ?? []).map((item) => ({ id: `so-${item.id}`, label: item.number ?? t('ui.palette.salesOrder'), hint: `${t('shell.sidebar.entries.SalesOrders')} • ${item.customerName}`, keywords: [item.number, item.customerName, item.status], run: () => navigate(`/sales/${item.id}`) })),
      ...(invoices.data?.items ?? []).map((item) => ({ id: `invoice-${item.id}`, label: item.number ?? t('ui.palette.draftInvoice'), hint: `${t('shell.sidebar.entries.Invoicing')} • ${item.customerName}`, keywords: [item.number ?? '', item.customerName, item.status], run: () => navigate(`/invoicing/${item.id}`) })),
      ...(payments.data?.items ?? []).map((item) => ({ id: `payment-${item.id}`, label: item.number, hint: `${t('shell.sidebar.entries.Invoicing')} • ${item.customerName}`, keywords: [item.number, item.customerName, item.status, item.method], run: () => navigate(`/invoicing/payments/${item.id}`) })),
    ];
    return [...commands, ...nav, ...records].filter((item) => {
      const text = [item.label, item.hint, ...item.keywords].join(' ').toLowerCase();
      return normalized.split(/\s+/).filter(Boolean).every((word) => text.includes(word));
    });
  }, [contacts.data?.items, invoices.data?.items, navigate, normalized, orders.data?.items, payments.data?.items, products.data, salesOrders.data?.items, searching, t]);

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
      <div className="command-palette" role="dialog" aria-modal="true" aria-label={t('ui.palette.dialogLabel')}>
      <button type="button" className="command-palette__backdrop" aria-label={t('ui.palette.close')} onClick={onClose} />
      <div className="command-palette__panel">
        <Input
          ref={inputRef}
          id="command-palette-input"
          label={t('ui.palette.searchLabel')}
          value={query}
          placeholder={t('ui.palette.searchPlaceholder')}
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
        <div className="command-palette__results" role="listbox" id={listId} aria-label={t('ui.palette.results')}>
          {visible.length === 0 ? (
            <p className="command-palette__empty">{t('ui.palette.noMatches')}</p>
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
                <Icon name={index === selectedIndex ? 'chevronRight' : 'search'} className={index === selectedIndex ? 'command-palette__selection-icon' : undefined} />
                <span className="command-palette__label">{item.label}</span>
                <span className="command-palette__hint">{item.hint}</span>
              </button>
            ))
          )}
        </div>
        <p className="command-palette__footer">
          <span><kbd>Enter</kbd> {t('ui.palette.open')}</span>
          <span><kbd>↑↓</kbd> {t('ui.palette.navigate')}</span>
          <span><kbd>Esc</kbd> {t('ui.palette.closePalette')}</span>
        </p>
      </div>
    </div>
  );
}
