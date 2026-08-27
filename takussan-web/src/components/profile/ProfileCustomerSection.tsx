'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { User } from '@/types/user';
import {
  useSavedSearchesQuery,
  type SavedSearch,
} from '@/lib/queries/saved-searches';
import { SearchPreferencesForm } from './SearchPreferencesForm';

interface ProfileCustomerSectionProps {
  user: User;
}

// "Default" saved search = the most recent active one (or, if none active,
// the most recent overall). Avoids tying the UX to a `metadata.is_default`
// flag the model doesn't carry today — see ticket TCK-136 "hors périmètre".
function pickDefault(searches: SavedSearch[]): SavedSearch | null {
  if (searches.length === 0) return null;
  const active = searches.filter((s) => s.is_active);
  const pool = active.length > 0 ? active : searches;
  return [...pool].sort((a, b) => b.id - a.id)[0] ?? null;
}

export function ProfileCustomerSection({ user }: ProfileCustomerSectionProps) {
  const t = useTranslations('profile.customer');
  const query = useSavedSearchesQuery();
  const emailVerified = Boolean(user.email_verified_at);

  const initial = useMemo(
    () => pickDefault(query.data?.data ?? []),
    [query.data?.data],
  );

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {query.isLoading ? (
        <div
          className="flex items-center gap-2 rounded-md bg-card/60 px-3 py-3 text-sm text-muted-foreground"
          data-testid="customer-prefs-loading"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : query.isError ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="customer-prefs-error"
        >
          {t('error')}
        </div>
      ) : (
        <SearchPreferencesForm initial={initial} emailVerified={emailVerified} />
      )}
    </section>
  );
}
