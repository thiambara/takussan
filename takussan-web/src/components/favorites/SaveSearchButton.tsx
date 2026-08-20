'use client';

import React, { useState } from 'react';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCreateSavedSearchMutation } from '@/lib/queries/saved-searches';
import type { SearchFilters } from '@/types/search';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { savedSearchPayloadSchema } from '@/lib/schemas/search';
import { traduireMessageValidation } from '@/lib/schemas/messages';
import { useTraducteurValidation } from '@/hooks/useApiForm';
import { useTranslations } from 'next-intl';

/**
 * "Save this search" CTA + naming modal — Wave 3 / TCK-047.
 *
 * Lives on the results page next to the active-filter pills. On click:
 * 1. If logged out → redirect to `/auth/login?redirect=<current>`.
 * 2. Otherwise → open a compact dialog to name the saved search. On
 *    submit, POST `/api/saved-searches` with the current filters.
 *
 * Kept under `components/favorites/**` since saved searches are a
 * bookmark-flavoured feature that sits next to favorites in the sidebar.
 */
export interface SaveSearchButtonProps {
  readonly filters: SearchFilters;
  readonly activeCount: number;
  readonly className?: string;
}

function filtersToCriteria(filters: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(filters) as Array<keyof SearchFilters>).forEach((key) => {
    const value = filters[key];
    if (value === undefined || value === null || value === '') return;
    if (key === 'page' || key === 'per_page') return;
    out[key] = value;
  });
  return out;
}

type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

/** Hors composant : les libellés lui sont passés, il ne peut pas appeler de hook. */
function suggestName(
  filters: SearchFilters,
  t: Traducteur,
  tContract: Traducteur,
  tTypes: Traducteur,
): string {
  const parts: string[] = [];
  if (filters.contract_type === 'sale') parts.push(tContract('sale'));
  if (filters.contract_type === 'rent') parts.push(tContract('rent'));
  if (filters.city) parts.push(filters.city);
  if (filters.type && filters.type.length > 0) parts.push(tTypes(filters.type[0]));
  if (filters.bedrooms != null) parts.push(t('bedroomsShort', { count: filters.bedrooms }));
  return parts.length > 0 ? parts.join(' · ') : t('defaultName');
}

export function SaveSearchButton({
  filters,
  activeCount,
  className = '',
}: SaveSearchButtonProps) {
  const t = useTranslations('search.saveSearch');
  // À la RACINE du dictionnaire : `t` ci-dessus est cantonné à `search.saveSearch` et ne peut pas
  // résoudre un `validation.search.…`.
  const tValidation = useTraducteurValidation();
  const tContract = useTranslations('property.contractTypes');
  const tTypes = useTranslations('property.types');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const create = useCreateSavedSearchMutation();

  const redirectHref = (() => {
    const qs = searchParams.toString();
    const current = qs ? `${pathname}?${qs}` : pathname;
    return `/auth/login?redirect=${encodeURIComponent(current)}`;
  })();

  function handleOpen() {
    if (!user) {
      router.push(redirectHref);
      return;
    }
    setName(suggestName(filters, t, tContract, tTypes));
    setNameError(null);
    setSavedId(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      criteria: filtersToCriteria(filters),
      notification_frequency: 'off' as const,
    };
    const parsed = savedSearchPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      // `issues[0].message` porte une CLÉ (`validation.search.…`), pas un libellé : sans cette
      // résolution, l'utilisateur lit `validation.search.savedSearchNameRequired` (TCK-292, lot L).
      setNameError(
        traduireMessageValidation(parsed.error.issues[0]?.message, tValidation)
        ?? t('invalidName'),
      );
      return;
    }
    setNameError(null);
    try {
      const res = await create.mutateAsync(parsed.data);
      setSavedId(res.data.id);
    } catch {
      setNameError(t('error'));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={activeCount === 0}
        className={`inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <BookmarkPlus className="w-4 h-4" />
        <span>{t('trigger')}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBodyFull')}</DialogDescription>
          </DialogHeader>

          {savedId ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm text-stone-700 mb-4">{t('savedFull')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  router.push('/app/saved-searches');
                }}
              >
                {t('viewMine')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="saved-search-name">{t('nameLabel')}</Label>
                <Input
                  id="saved-search-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  maxLength={100}
                  required
                />
                {nameError && (
                  <p className="text-xs text-red-600">{nameError}</p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={create.isPending}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      {t('saving')}
                    </>
                  ) : (
                    t('save')
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
