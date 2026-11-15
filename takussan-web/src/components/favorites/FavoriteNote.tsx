'use client';

import { useState } from 'react';
import { Loader2, NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FAVORITE_NOTES_MAX, useUpdateFavoriteNotesMutation, type FavoriteItem } from '@/lib/queries/favorites';
import type { PropertyListItem } from '@/types/property';

/**
 * Ce que la page des favoris « Le suivi » (TCK-2508) rend de chaque favori du compte, sur le site
 * comme dans la coque de `/app` (TCK-2618) : les deux sortes de favori, la normalisation du bien
 * rendu par l'API et la note personnelle éditable en place.
 *
 * Module à part depuis TCK-2508 : il était partagé avec la liste de la console (`FavoritesList`),
 * qui importait la pagination de la console (`console.pagination`) — la page publique qui l'aurait
 * importée faisait entrer l'espace `console` dans la frontière i18n publique
 * (`scripts/check-i18n-namespaces.mjs`). Cette liste n'était plus rendue : retirée par TCK-2738.
 */
export type AvailableFavorite = Extract<FavoriteItem, { availability: 'available' }>;
export type UnavailableFavorite = Exclude<FavoriteItem, { availability: 'available' }>;

export function normalizeFavoriteProperty(property: AvailableFavorite['property']): PropertyListItem {
  // The API returns the property via `PropertyResource::make()` — the shape is
  // a superset of PropertyListItem. We trust the backend to provide the listed
  // fields and cast defensively to avoid TS complaining about the extra keys.
  const raw = { ...property } as unknown as Partial<PropertyListItem> & {
    address?: { city?: string; region?: string; country?: string; quarter?: string; latitude?: number; longitude?: number };
    main_photo_url?: string | null;
  };
  // If the backend happens to return an `address` relation instead of the flat
  // `location`, patch it on the fly.
  if (!raw.location && raw.address) {
    raw.location = {
      quarter: raw.address.quarter ?? null,
      city: raw.address.city ?? null,
      region: raw.address.region ?? null,
      country: raw.address.country ?? null,
      latitude: raw.address.latitude ?? null,
      longitude: raw.address.longitude ?? null,
    };
  }
  return raw as PropertyListItem;
}

export function FavoriteNote({ item }: { item: AvailableFavorite }) {
  const t = useTranslations('favorites.page.note');
  const update = useUpdateFavoriteNotesMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.notes ?? '');
  const [error, setError] = useState(false);
  const fieldId = `favorite-note-${item.id}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    try {
      await update.mutateAsync({ property_id: item.property_id, notes: draft });
      setEditing(false);
    } catch {
      setError(true);
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-start gap-2 text-sm">
        {item.notes ? (
          <p className="min-w-0 flex-1 whitespace-pre-line break-words text-muted-foreground">{item.notes}</p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(item.notes ?? '');
            setEditing(true);
          }}
          className={item.notes ? 'shrink-0' : '-ml-2'}
        >
          <NotebookPen className="size-4" aria-hidden="true" />
          {item.notes ? t('edit') : t('add')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-2 space-y-2">
      <label htmlFor={fieldId} className="sr-only">
        {t('label')}
      </label>
      <Textarea
        id={fieldId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={FAVORITE_NOTES_MAX}
        rows={3}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t('count', { count: draft.length, max: FAVORITE_NOTES_MAX })}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('save')}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t('error')}
        </p>
      ) : null}
    </form>
  );
}
