/**
 * The compact "…" kebab trigger used inside DropdownMenu on list pages.
 *
 * Extracted once (T016) so Products, Contacts and Inventory all render the
 * same single-square button instead of the invalid button-in-button markup
 * that happened when a `<button>` was passed as the DropdownMenu trigger.
 */

import { DropdownMenu } from './dropdown-menu';
import type { DropdownMenuEntry } from './dropdown-menu';

export interface KebabMenuProps {
  readonly label: string;
  readonly entries: readonly DropdownMenuEntry[];
}

export function KebabMenu({ label, entries }: KebabMenuProps) {
  return (
    <DropdownMenu
      label={label}
      trigger={
        <span
          className="kebab-trigger"
          aria-label={label}
          role="button"
          tabIndex={0}
        >
          <span className="sr-only">{label}</span>
          <span>…</span>
        </span>
      }
      entries={entries}
    />
  );
}
