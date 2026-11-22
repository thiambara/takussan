'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HandCoins, Wrench } from 'lucide-react';

import { Disque, TitreBloc } from '@/components/accueil/pieces';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import { useProchainReversement } from '@/lib/queries/accueil-bailleur';
import { useEnCoursDuBailleur } from '@/lib/queries/maintenance-signalement';
import type { Payout } from '@/types/invoice';

/**
 * TCK-2624 (lot 2, maquette `app-accueil` a, « En cours sur vos biens ») — les interventions ouvertes
 * sur les biens du bailleur, lues comme l'écran « Interventions » du bailleur les lit
 * (`useEnCoursDuBailleur`, TCK-2654 : même clé, même filtre de l'API) : « Fuite sous évier · F2, Grand
 * Yoff », « Astou Sy intervient aujourd'hui à 09:30 » quand un passage est fixé, « passage à fixer »
 * sinon (le libellé du statut vit dans `maintenance`, que la frontière de l'accueil ne sert pas : 2 %
 * du dictionnaire pour un mot).
 *
 * Colonne de droite au bureau, sous « À faire » au téléphone.
 *
 * TCK-2850 — puis « Prochain reversement · 15 nov. » / « 10 260 000 F · après commission », la rangée de la
 * maquette (e2, aux deux formats, dans CE bloc), qui mène à l'onglet « Reversements » des rapports. L'API
 * ne sert pas de CALENDRIER de reversement (TCK-2863), mais la date d'un reversement déjà créé,
 * `scheduled_at`, est servie : la rangée lit le premier reversement à venir AU BAILLEUR
 * (`useProchainReversement`, `payee_role=landlord`). Aucun à venir : pas de rangée. Un reversement encore
 * sans date (en attente d'approbation) se dit « Prochain reversement », sans « · ».
 *
 * Ni intervention ni reversement à venir : le bloc ne se rend pas.
 */
export function EnCoursSurVosBiens({ landlordId }: { readonly landlordId: number }) {
  const t = useTranslations('accueil.bailleur.enCours');
  const enCours = useEnCoursDuBailleur();
  const reversement = useProchainReversement(landlordId).data?.data?.[0] ?? null;
  const lignes = enCours.data?.data ?? [];
  if (lignes.length === 0 && !reversement) return null;

  return (
    <section data-slot="en-cours-sur-vos-biens" aria-labelledby="en-cours-titre">
      <div className="md:hidden">
        <TitreBloc id="en-cours-titre">{t('titre')}</TitreBloc>
      </div>
      <div className="rounded-xl border border-border bg-card max-md:mx-4 max-md:mt-2">
        <h2 className="border-b border-border px-4 py-3 text-corps font-semibold max-md:hidden">{t('titre')}</h2>
        <ul className="divide-y divide-border">
          {lignes.map((i) => (
            <LigneEnCours key={i.id} i={i} />
          ))}
          {reversement ? <LigneDuReversement r={reversement} /> : null}
        </ul>
      </div>
    </section>
  );
}

function LigneEnCours({ i }: { readonly i: InterventionEnFile }) {
  const t = useTranslations('accueil.bailleur.enCours');
  const f = useFormatteurs();
  const prestataire = i.assignee?.name ?? null;
  const quand = i.scheduled_at ? { jour: jourDuPassage(i.scheduled_at, new Date(), (d) => f.date(d, DATE_COURTE)), date: f.jourMois(i.scheduled_at), heure: f.heure(i.scheduled_at) } : null;
  let suite: string;
  if (quand && prestataire) suite = t('passageDe', { ...quand, nom: prestataire });
  else if (quand) suite = t('passage', quand);
  else suite = prestataire ? t('aFixerAvec', { nom: prestataire }) : t('aFixer');

  return (
    <li className="relative flex items-center gap-3 px-4 py-3">
      <Disque icone={Wrench} className="size-8" />
      <div className="min-w-0 flex-1 leading-tight">
        <Link
          href={`/app/maintenance/${i.id}`}
          className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {i.property?.title ? t('titreEtBien', { titre: i.title, bien: i.property.title }) : i.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{suite}</p>
      </div>
    </li>
  );
}

/** TCK-2850 — « Prochain reversement · 15 nov. » / « 10 260 000 F · après commission » (le net du reversement). */
function LigneDuReversement({ r }: { readonly r: Payout }) {
  const t = useTranslations('accueil.bailleur.enCours');
  const f = useFormatteurs();
  return (
    <li data-slot="prochain-reversement" className="relative flex items-center gap-3 px-4 py-3">
      <Disque icone={HandCoins} className="size-8 bg-success/10 text-success" />
      <div className="min-w-0 flex-1 leading-tight">
        <Link
          href="/app/reports/payouts"
          className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {r.scheduled_at ? t('reversementLe', { date: f.jourMois(r.scheduled_at) }) : t('reversement')}
        </Link>
        <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
          {t('apresCommission', { montant: f.montantCourt(r.net_amount, r.currency ?? undefined) })}
        </p>
      </div>
    </li>
  );
}

/**
 * « aujourdhui », « demain », « hier », « passe » (avant hier) ou « autre » (plus tard). Un passage
 * daté du passé n'est jamais dit « intervient » ni « est intervenu » : l'intervention est toujours
 * en cours, l'API ne dit pas si le passage a eu lieu — « passage prévu le 7 nov. ».
 */
export function jourDuPassage(iso: string, maintenant: Date, jourDe: (d: Date) => string): 'aujourdhui' | 'demain' | 'hier' | 'passe' | 'autre' {
  const jour = jourRelatif(iso, maintenant, jourDe);
  if (jour !== 'autre') return jour;
  const debutDuJour = new Date(maintenant);
  debutDuJour.setHours(0, 0, 0, 0);
  return new Date(iso).getTime() < debutDuJour.getTime() ? 'passe' : 'autre';
}
