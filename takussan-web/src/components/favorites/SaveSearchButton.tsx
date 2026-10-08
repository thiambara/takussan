'use client';

import React, { useState } from 'react';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  useCreateSavedSearchMutation,
  type SavedSearchAlertChannel,
} from '@/lib/queries/saved-searches';
import { PublicSearchAlertForm } from '@/components/favorites/PublicSearchAlertForm';
import { CLES_DE_RECHERCHE, SEARCH_FILTER_KEYS, type SearchFilters } from '@/types/search';
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
 * "Save this search" CTA + naming modal — Wave 3 / TCK-047, revu par TCK-599.
 *
 * Lives on the results page next to the active-filter pills. On click:
 * 1. If logged out → TCK-599 (V13) : the dialog offers « Me prévenir des nouveaux biens »
 *    without an account ({@link PublicSearchAlertForm}), plus the login link that leads back
 *    to saving the search.
 * 2. Otherwise → open a compact dialog to name the saved search. On
 *    submit, POST `/api/saved-searches` with the current filters.
 *
 * TCK-599 (C6) — l'honnêteté du libellé voulue par TCK-552 est préservée : « Sauvegarder la
 * recherche » reste le geste, et l'alerte est une case DÉCOCHÉE. La confirmation dit exactement
 * ce qui a été créé — une recherche seule, ou une recherche avec son alerte quotidienne et les
 * canaux par lesquels l'API dit qu'elle arrivera (`alert_channels`), jamais une supposition.
 *
 * Kept under `components/favorites/**` since saved searches are a
 * bookmark-flavoured feature that sits next to favorites in the sidebar.
 */
export interface SaveSearchButtonProps {
  readonly filters: SearchFilters;
  readonly activeCount: number;
  readonly className?: string;
}

/**
 * TCK-340 — troisième définition des clés à ignorer, et la seule des trois qui avait DÉRIVÉ.
 *
 * Elle écartait `page` et `per_page` mais gardait `sort` : le tri finissait donc dans le
 * `criteria` d'une recherche sauvegardée, où il n'a rien à faire — ce n'est pas un critère,
 * c'est une préférence d'affichage, et le digest de notification côté serveur l'apparie contre
 * des biens neufs où l'ordre n'a aucun sens. Les deux autres définitions (`IGNORED_KEYS` et
 * `HIDDEN_FROM_TAGS`) écartaient bien les trois.
 *
 * Le critère est maintenant le RÔLE déclaré dans la table, pas une liste recopiée.
 */
export function filtersToCriteria(filters: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CLES_DE_RECHERCHE) {
    if (SEARCH_FILTER_KEYS[key].role !== 'filtre') continue;
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * Hors composant : les libellés lui sont passés, il ne peut pas appeler de hook.
 *
 * ⚠ TCK-340 — **cette liste-ci n'est PAS unifiée, et c'est délibéré.** Elle ne cite que quatre
 * clés sur dix-sept, ce qui ressemble à une divergence et n'en est pas : un nom suggéré est un
 * RÉSUMÉ, pas un inventaire. Le dériver de la table produirait « Location · Dakar · Villa ·
 * 3 ch. · ≥ 150 000 FCFA · ≤ 900 000 FCFA · ≥ 40 m² · Meublé · ★ En vedette · … » dans un champ
 * plafonné à 100 caractères. La curation est la fonction ; l'unifier la supprimerait.
 */
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
  const tPublic = useTranslations('search.publicAlert');
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
  const [alsoAlert, setAlsoAlert] = useState(false);
  const [saved, setSaved] = useState<{ id: number; channels: SavedSearchAlertChannel[] | null } | null>(
    null,
  );
  const create = useCreateSavedSearchMutation();
  const tChannels = useTranslations('search.alertChannels');

  const redirectHref = (() => {
    const qs = searchParams.toString();
    const current = qs ? `${pathname}?${qs}` : pathname;
    return `/auth/login?redirect=${encodeURIComponent(current)}`;
  })();

  function handleOpen() {
    setName(suggestName(filters, t, tContract, tTypes));
    setNameError(null);
    setSaved(null);
    setAlsoAlert(false);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      criteria: filtersToCriteria(filters),
      notification_frequency: alsoAlert ? ('daily' as const) : ('off' as const),
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
      setSaved({
        id: res.data.id,
        channels: parsed.data.notification_frequency === 'off' ? null : (res.data.alert_channels ?? []),
      });
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
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <BookmarkPlus className="w-4 h-4" />
        <span>{t('trigger')}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {!user ? (
            <>
              <DialogHeader>
                <DialogTitle>{tPublic('dialogTitle')}</DialogTitle>
                <DialogDescription>{tPublic('dialogBody')}</DialogDescription>
              </DialogHeader>
              <PublicSearchAlertForm
                criteria={filtersToCriteria(filters)}
                name={name}
                loginHref={redirectHref}
                onClose={() => setOpen(false)}
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('dialogTitle')}</DialogTitle>
                <DialogDescription>{t('dialogBodyFull')}</DialogDescription>
              </DialogHeader>

              {saved ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center mb-3">
                    <Check className="w-5 h-5 text-success" />
                  </div>
                  <p className="text-sm text-foreground mb-4" role="status">
                    {saved.channels === null
                      ? t('savedFull')
                      : t('savedWithAlert', {
                          channels: saved.channels.map((c) => tChannels(c)).join(', '),
                        })}
                  </p>
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
                      <p className="text-xs text-destructive">{nameError}</p>
                    )}
                  </div>

                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={alsoAlert}
                      onChange={(e) => setAlsoAlert(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      {t('alsoAlert')}
                      <span className="block text-xs bg-popover text-muted-foreground">{t('alsoAlertHint')}</span>
                    </span>
                  </label>

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
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
