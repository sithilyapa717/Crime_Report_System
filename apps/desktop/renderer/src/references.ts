// Reference lists for drop-downs, loaded once per app session and shared between screens.
import type { ReferenceItem } from '@excise/contract';
import type { ReferenceKind } from '@excise/schemas';
import { useEffect, useState } from 'react';
import type { Option } from '../design-system/index.js';
import { call } from './ipc.js';

const cache = new Map<ReferenceKind, Promise<ReferenceItem[]>>();

export function loadList(kind: ReferenceKind): Promise<ReferenceItem[]> {
  let p = cache.get(kind);
  if (!p) {
    p = call('reference.list', kind).catch((e: unknown) => {
      cache.delete(kind);
      throw e;
    });
    cache.set(kind, p);
  }
  return p;
}

/** After the list editor changes a list. */
export function forgetLists(): void {
  cache.clear();
}

export function useRefList(kind: ReferenceKind): ReferenceItem[] {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  useEffect(() => {
    let live = true;
    loadList(kind)
      .then((x) => live && setItems(x))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kind]);
  return items;
}

/** Drop-down options; offences show `CODE – name`. */
export function useRefOptions(kind: ReferenceKind): Option[] {
  return useRefList(kind).map((i) => ({
    value: i.id,
    label: i.code ? `${i.code} – ${i.value}` : i.rank ? `${i.rank} ${i.value}` : i.value,
  }));
}

/** id → display name, for read-only views. */
export function useRefNames(kinds: ReferenceKind[]): (id: string | undefined | null) => string {
  const [names, setNames] = useState(new Map<string, string>());
  const key = kinds.join(',');
  useEffect(() => {
    let live = true;
    Promise.all(kinds.map(loadList))
      .then((lists) => {
        if (!live) return;
        const m = new Map<string, string>();
        for (const i of lists.flat()) m.set(i.id, i.code ? `${i.code} – ${i.value}` : i.value);
        setNames(m);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return (id) => (id ? (names.get(id) ?? '') : '');
}
