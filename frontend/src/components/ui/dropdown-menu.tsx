/**
 * The dropdown menu (T051, FR-029).
 *
 * Four behaviours are required by FR-029 and are the reason this is a component
 * rather than a `<ul>` written inline at each call site:
 *
 *  - **Escape closes it and returns focus to the trigger.** A menu that closes
 *    and drops focus on the document body leaves a keyboard user at the top of
 *    the page with no idea where they were.
 *  - **An interaction outside closes it.** Without this, two menus stay open and
 *    the page starts lying about what is selected.
 *  - **Only one menu is open at a time.** The registry below is module-scoped
 *    because "one at a time" is a property of the page, not of a menu: a
 *    component that only knew about itself could not enforce it.
 *  - **An unavailable entry carries its reason, in place.** It is rendered with
 *    `aria-disabled` and its reason as visible text rather than being omitted, so
 *    the absence of the capability is stated instead of hidden (FR-015).
 *
 * Entries are `menuitemradio` when they represent a choice out of a set (the
 * sample organization) and plain `menuitem` otherwise, so the current selection
 * is announced rather than only coloured.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

/** An entry that acts. `selected` is present only for a choice out of a set. */
export interface DropdownMenuItem {
  readonly kind: 'item';
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly selected?: boolean;
}

/** An entry that cannot act, and says why. */
export interface DropdownMenuUnavailableItem {
  readonly kind: 'unavailable';
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuUnavailableItem;

export interface DropdownMenuProps {
  /** The trigger's visible content. It should name itself, not rely on an icon. */
  readonly trigger: ReactNode;
  /** The menu's accessible name, e.g. "Sample organization". */
  readonly label: string;
  readonly entries: readonly DropdownMenuEntry[];
  readonly className?: string;
}

/** The entries arrow keys and Tab-less navigation can land on. */
const FOCUSABLE_ITEM =
  '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])';

/**
 * The menus currently open. Opening one closes every other, which is what keeps
 * "only one menu open at a time" true no matter how many are on the page.
 */
const openMenus = new Set<() => void>();

export function DropdownMenu({ trigger, label, entries, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Register while open, so another menu opening can close this one.
  useEffect(() => {
    if (!open) return undefined;

    openMenus.add(close);
    return () => {
      openMenus.delete(close);
    };
  }, [open, close]);

  // An interaction outside closes the menu. Focus is deliberately not moved:
  // the person has already chosen where they are going.
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Focus the first available entry as the menu opens, so a keyboard user is
  // inside it rather than on a trigger whose next Tab is unpredictable.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(FOCUSABLE_ITEM)?.focus();
  }, [open]);

  function openMenu() {
    for (const other of openMenus) other();
    setOpen(true);
  }

  function closeAndRestoreFocus() {
    close();
    triggerRef.current?.focus();
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM) ?? [],
    );
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(current + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const active = document.activeElement as HTMLElement | null;
      if (active !== null && items.includes(active)) {
        event.preventDefault();
        active.click();
      }
    }
  }

  return (
    <div
      className={className === undefined ? 'menu' : `menu ${className}`}
      ref={rootRef}
      onKeyDown={onRootKeyDown}
    >
      <button
        type="button"
        className="menu__trigger"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            close();
          } else {
            openMenu();
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>

      {open && (
        <ul
          className="menu__list"
          id={listId}
          role="menu"
          aria-label={label}
          ref={listRef}
          onKeyDown={onListKeyDown}
        >
          {entries.map((entry) =>
            entry.kind === 'unavailable' ? (
              <li
                key={entry.id}
                className="menu__item menu__item--unavailable"
                role="menuitem"
                aria-disabled="true"
                tabIndex={-1}
              >
                <span className="menu__item-label">{entry.label}</span>
                <span className="menu__item-reason">{entry.reason}</span>
              </li>
            ) : (
              <li
                key={entry.id}
                className="menu__item"
                role={entry.selected === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={entry.selected}
                tabIndex={-1}
                onClick={() => {
                  entry.onSelect();
                  closeAndRestoreFocus();
                }}
              >
                <span className="menu__item-label">{entry.label}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
