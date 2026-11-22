'use client';

import { useTranslations } from 'next-intl';
import { PowerOff, Sparkles } from 'lucide-react';
import type { EtatDeSorte } from '@/lib/queries/copilote';

/**
 * TCK-2977 (maquette `fil-copilote` A, écran `limites`) — l'assistant ne propose rien, et le dit, sobrement :
 * un cadre plein (pas de tirets, il n'y a rien à valider), ✦ grisé, jamais une erreur rouge, jamais un montant.
 * Rend `null` pour tout état qui n'est ni « en pause » ni « coupé » : la raison d'une indisponibilité de droits
 * n'est jamais dite (ADR-0131 § 1).
 */
export type RaisonDuSilence = 'pause' | 'coupeAgence' | 'coupePlateforme';

/** La raison à dire, lue sur l'état d'une sorte (`refusee` / `echec` avec son code, et la portée d'une coupure). */
export function raisonDuSilence(etat: Pick<EtatDeSorte<unknown>, 'etat' | 'code' | 'portee'> | null | undefined): RaisonDuSilence | null {
  if (!etat || (etat.etat !== 'refusee' && etat.etat !== 'echec')) return null;
  if (etat.code === 'copilote.budget_epuise') return 'pause';
  if (etat.code === 'copilote.coupe') return etat.portee === 'agence' ? 'coupeAgence' : 'coupePlateforme';
  return null;
}

export function EtatDeLAssistant({ raison }: { readonly raison: RaisonDuSilence }) {
  const t = useTranslations('messaging.copilote.etat');
  const Icone = raison === 'pause' ? Sparkles : PowerOff;
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-border bg-card p-3.5" data-testid="etat-de-l-assistant">
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icone className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t(`${raison}.titre`)}</p>
        <p className="mt-0.5 text-ui leading-snug text-pretty text-muted-foreground">{t(`${raison}.texte`)}</p>
      </div>
    </div>
  );
}
