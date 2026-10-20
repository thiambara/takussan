'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useCreateSavedSearchMutation, type SavedSearchAlertChannel } from '@/lib/queries/saved-searches';
import { PublicSearchAlertForm } from '@/components/favorites/PublicSearchAlertForm';
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

/**
 * TCK-1037 (P69.04) — le dialogue de {@link SaveSearchButton}, dans son propre module.
 *
 * Il tire zod (`savedSearchPayloadSchema`), react-hook-form (`useApiForm`) et le formulaire
 * d'alerte sans compte. Importé statiquement par le bouton, tout cela entrait dans le JS initial de
 * `/properties` avant le premier clic. Le bouton le charge désormais par `next/dynamic` et ne le
 * monte qu'à la première ouverture, sur le modèle des dialogues de la fiche (TCK-850).
 * `zod-hors-des-pages-publiques.test.ts` garde que le bouton ne l'importe plus statiquement.
 */
export interface SaveSearchDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly filters: SearchFilters;
  readonly criteria: Record<string, unknown>;
  /** Change à chaque ouverture : le formulaire repart de zéro (nom suggéré, alerte décochée). */
  readonly ouverture: number;
}

export function SaveSearchDialog({ open, onOpenChange, filters, criteria, ouverture }: SaveSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CorpsDuDialogue key={ouverture} filters={filters} criteria={criteria} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
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

function CorpsDuDialogue({
  filters,
  criteria,
  onClose,
}: {
  readonly filters: SearchFilters;
  readonly criteria: Record<string, unknown>;
  readonly onClose: () => void;
}) {
  const t = useTranslations('search.saveSearch');
  const tPublic = useTranslations('search.publicAlert');
  // À la RACINE du dictionnaire : `t` ci-dessus est cantonné à `search.saveSearch` et ne peut pas
  // résoudre un `validation.search.…`.
  const tValidation = useTraducteurValidation();
  const tContract = useTranslations('property.contractTypes');
  const tTypes = useTranslations('property.types');
  const tChannels = useTranslations('search.alertChannels');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [name, setName] = useState(() => suggestName(filters, t, tContract, tTypes));
  const [nameError, setNameError] = useState<string | null>(null);
  const [alsoAlert, setAlsoAlert] = useState(false);
  const [saved, setSaved] = useState<{ id: number; channels: SavedSearchAlertChannel[] | null } | null>(
    null,
  );
  const create = useCreateSavedSearchMutation();

  const redirectHref = (() => {
    const qs = searchParams.toString();
    const current = qs ? `${pathname}?${qs}` : pathname;
    return `/auth/login?redirect=${encodeURIComponent(current)}`;
  })();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      criteria,
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

  return !user ? (
      <>
        <DialogHeader>
          <DialogTitle>{tPublic('dialogTitle')}</DialogTitle>
          <DialogDescription>{tPublic('dialogBody')}</DialogDescription>
        </DialogHeader>
        <PublicSearchAlertForm
          criteria={criteria}
          name={name}
          loginHref={redirectHref}
          onClose={onClose}
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
                onClose();
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
                onClick={() => onClose()}
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
  );
}
