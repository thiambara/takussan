'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DESTINATIONS_DE_MISE_EN_SERVICE, etatDeMiseEnService } from '@/components/dashboard/admin/etapes-de-mise-en-service';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminMiseEnService, cleMiseEnService, type SetupStatusResponse } from '@/lib/queries/mise-en-service';
import { cn } from '@/lib/utils';
import type { AgencyKind } from '@/types/agency';

/**
 * TCK-2622 — la mise en service de l'agence sur l'accueil : UNE ligne (maquette `LigneDemarrage`),
 * jamais la carte de sept lignes, qui reste sur `/app/overview/agency` (`MiseEnService`). Elle nomme
 * l'étape suivante — la 2FA d'abord (TCK-761) — et y MÈNE, avec le compte « 6/7 » (téléphone) ou
 * « 6 étapes sur 7 » (bureau).
 *
 * Même requête et même règle que la carte (`etapes-de-mise-en-service.ts`) : elle disparaît une fois
 * l'agence prête, et ne rend rien sur un refus ou une panne. Une étape restante que l'interface ne
 * sait pas mener (clé inconnue) ne se nomme pas : sans étape connue à faire, rien ne se rend.
 */

interface BandeauMiseEnServiceProps {
  readonly agencyId: number;
  readonly kind: AgencyKind | null;
  /** Le bureau : « Mise en service de l'agence · 6 étapes sur 7 », la phrase, « Continuer ». */
  readonly large?: boolean;
}

/** L'anneau de progression (20 px). */
function Anneau({ fait, total }: { readonly fait: number; readonly total: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" className="size-5 flex-none -rotate-90" aria-hidden="true">
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="stroke-success/25" />
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(c * fait) / total} ${c}`} className="stroke-success" />
    </svg>
  );
}

export function BandeauMiseEnService({ agencyId, kind, large = false }: BandeauMiseEnServiceProps) {
  const t = useTranslations('accueil.miseEnService');
  const { data } = useApiQuery<SetupStatusResponse>(cleMiseEnService(agencyId), cheminMiseEnService(agencyId), { retry: false });
  const etat = etatDeMiseEnService(data, kind);
  const suivante = etat?.suivante;
  if (!etat || !suivante) return null;

  const { faites, total } = etat;
  const etape = t(`etapes.${suivante.key}`);
  const restantes = total - faites;
  return (
    <Link
      href={DESTINATIONS_DE_MISE_EN_SERVICE[suivante.key]!}
      data-slot="bandeau-mise-en-service"
      aria-label={t('lien', { fait: faites, total, etape })}
      className={cn(
        'flex items-center gap-2.5 rounded-xl bg-success/10 text-sm outline-none hover:bg-success/15 focus-visible:ring-3 focus-visible:ring-ring',
        large ? 'h-12 px-4' : 'mx-4 mt-3 h-11 px-3',
      )}
    >
      <Anneau fait={faites} total={total} />
      <span className="flex-none font-semibold tabular-nums text-success">
        {large ? `${t('titre')} · ${t('compteLong', { fait: faites, total })}` : `${faites}/${total}`}
      </span>
      <span className="min-w-0 flex-1 truncate text-encre-douce">
        {large ? t(restantes === 1 ? 'resteUne' : 'prochaine', { etape: t(`enPhrase.${suivante.key}`) }) : etape}
      </span>
      {large ? <span className="flex-none text-ui font-medium text-success">{t('continuer')}</span> : null}
      <ChevronRight className="size-4 flex-none text-success" aria-hidden="true" />
    </Link>
  );
}
