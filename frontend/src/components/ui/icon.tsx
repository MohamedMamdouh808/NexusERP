/**
 * The icon layer (T053).
 *
 * One permissively licensed library is permitted (FR-055), and its icons are
 * imported **individually** so the bundler keeps only the ones the interface
 * actually uses. Importing the package's barrel and indexing into it at runtime
 * (`icons[name]`) would defeat tree-shaking and ship hundreds of glyphs to do a
 * dozen jobs, so every icon below is a named import and the registry is a static
 * object.
 *
 * Three rules this file exists to hold (FR-044, FR-056):
 *
 *  - An icon is **decorative by default** and hidden from assistive technology,
 *    because the accessible name belongs to the control or the text it sits
 *    beside. Announcing "chart-column icon" before "Reports" is noise.
 *  - Colour comes from `currentColor`, so an icon inherits the token-derived
 *    colour of its context instead of carrying a value of its own.
 *  - Size comes from a token, `--spacing-md`, through the `.icon` rule in
 *    `app.css` - so the size is part of the design system rather than a number
 *    written here.
 *
 * An icon-only control passes `label`, which the `Icon` component renders as a
 * visually hidden accessible name and the caller pairs with a `title` tooltip
 * (see `IconButton` in `button.tsx`).
 */

import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Building2,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardList,
  Ellipsis,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Package,
  ReceiptText,
  ScrollText,
  Search,
  ShoppingCart,
  TriangleAlert,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Every icon the interface uses, by a name the product owns.
 *
 * The names describe the meaning in this product, not the glyph: `invoicing`
 * rather than `receipt-text`. That way replacing the library is a change to this
 * file alone, and a caller cannot reach into the library's vocabulary.
 */
export const ICONS = {
  overview: LayoutDashboard,
  sales: ShoppingCart,
  inventory: Boxes,
  reports: ChartColumn,
  products: Package,
  contacts: Users,
  purchasing: ClipboardList,
  invoicing: ReceiptText,
  users: UserCog,
  organization: Building2,
  audit: ScrollText,
  health: Activity,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  check: Check,
  close: X,
  ellipsis: Ellipsis,
  search: Search,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
  spinner: LoaderCircle,
  sortable: ArrowUpDown,
  sortAscending: ArrowUp,
  sortDescending: ArrowDown,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  readonly name: IconName;
  /**
   * An accessible name for an icon that carries meaning on its own. Omitted for a
   * decorative icon, which is then hidden from assistive technology (FR-044).
   */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Renders one icon. Decorative unless `label` is given, in which case the icon
 * gains `role="img"` and an accessible name rather than relying on a tooltip,
 * which a screen reader does not read.
 */
export function Icon({ name, label, className }: IconProps) {
  const Glyph = ICONS[name];
  const classes = className === undefined ? 'icon' : `icon ${className}`;

  if (label === undefined) {
    return <Glyph className={classes} aria-hidden="true" focusable="false" />;
  }

  return (
    <span className={classes} role="img" aria-label={label}>
      <Glyph aria-hidden="true" focusable="false" />
    </span>
  );
}

/** True when a name is one of the registry's — used by the gallery's typing. */
export function isIconName(value: string): value is IconName {
  return value in ICONS;
}
