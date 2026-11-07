import type { KeyboardEvent } from 'react';

/**
 * The underline tab strip shared by every multi-tab feature page (Inventory,
 * Purchasing). Extracted at the second occurrence so a third feature reuses it
 * instead of copying markup.
 *
 * Tabs are buttons, not links: the active tab is `aria-pressed`, and selecting
 * one is the page's decision (a navigation to the tab's path). Deep links work
 * because the page derives its active tab from the pathname on load.
 */
export interface TabDefinition {
  readonly key: string;
  readonly label: string;
  readonly path: string;
}

export interface TabStripProps {
  readonly tabs: readonly TabDefinition[];
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
}

export function TabStrip({ tabs, activeKey, onSelect }: TabStripProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Left and right move selection, as keyboard users expect of a tab row.
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === activeKey);
    if (index === -1) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onSelect(tabs[next].key);
  }

  return (
    <div className="tab-strip" role="tablist" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeKey === tab.key}
          aria-pressed={activeKey === tab.key}
          tabIndex={activeKey === tab.key ? 0 : -1}
          className={['tab-strip__tab', activeKey === tab.key ? 'tab-strip__tab--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
