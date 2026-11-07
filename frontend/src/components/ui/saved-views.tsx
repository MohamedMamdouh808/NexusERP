import { useCallback, useMemo, useState } from 'react';
import { Button, Input } from './index';

export interface SavedView<T> {
  readonly id: string;
  readonly name: string;
  readonly state: T;
}

interface SavedViewsProps<T> {
  readonly storageKey: string;
  readonly current: T;
  readonly nameFor: (state: T) => string;
  readonly onSelect: (state: T) => void;
  readonly label?: string;
}

function loadViews<T>(storageKey: string): SavedView<T>[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) as SavedView<T>[] : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === 'string' && item.state) : [];
  } catch {
    return [];
  }
}

export function SavedViews<T>({ storageKey, current, nameFor, onSelect, label = 'Saved views' }: SavedViewsProps<T>) {
  const [views, setViews] = useState<SavedView<T>[]>(() => loadViews(storageKey));
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const currentName = useMemo(() => nameFor(current), [current, nameFor]);

  const persist = useCallback((next: SavedView<T>[]) => {
    setViews(next);
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The control reports success optimistically; storage may be unavailable.
    }
  }, [storageKey]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed && !currentName) {
      setEditingName(false);
      return;
    }
    const next = {
      id: globalThis.crypto?.randomUUID?.() ?? `view-${Date.now()}`,
      name: trimmed || currentName || 'View',
      state: current,
    };
    persist([next, ...views.filter((entry) => entry.name !== next.name)].slice(0, 8));
    setName('');
    setEditingName(false);
  };

  return (
    <div className="saved-views" aria-label={label}>
      <div className="saved-views__actions">
        {editingName ? (
          <>
            <Input id="saved-view-name" label="View name" value={name} placeholder={currentName || 'My view'} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditingName(false); }} />
            <Button type="button" variant="primary" onClick={save}>Save</Button>
            <Button type="button" onClick={() => setEditingName(false)}>Cancel</Button>
          </>
        ) : (
          <Button type="button" onClick={() => setEditingName(true)}>Save view</Button>
        )}
      </div>
      {views.length > 0 && (
        <ul className="saved-views__list">
          {views.map((view) => (
            <li key={view.id}>
              <button type="button" className="saved-views__chip" onClick={() => onSelect(view.state)}>{view.name}</button>
              <button type="button" className="saved-views__remove" aria-label={`Delete saved view ${view.name}`} onClick={() => persist(views.filter((entry) => entry.id !== view.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
