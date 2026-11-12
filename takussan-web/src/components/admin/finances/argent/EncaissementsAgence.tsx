'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, ChevronLeft, ChevronRight, SlidersHorizontal, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';
import { PAYMENT_METHOD_VALUES, PAYMENT_STATUS_VALUES } from '@/components/payments/constants';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { bornesDesEncaissements } from '@/lib/finances/vue-argent';
import { dateDuMois } from '@/lib/finances/mois';
import { usePaymentsHistory, type PaymentHistoryEntity, type UsePaymentsHistoryParams } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { ChoixAvecRecherche, ChoixDansUneListe, useEtatDeRecherche, type OptionDeChoix } from './choix';
import { grouperParJour, joursRecents } from './encaissement';
import { AvatarDuPayeur, IconeDeMoyen, LigneDEncaissementTelephone, StatutDEncaissement, useLectureDEncaissement } from './LigneDEncaissement';
import { useOptionsDesBailleurs, useOptionsDesBiens, useOptionsDesPayeurs } from './sources';

/**
 * TCK-2659 — les ENCAISSEMENTS de l'agence, nommés (maquette « Encaissements », approche A).
 *
 * Tous les filtres sont dans l'adresse et partent au SERVEUR (`GET /api/payments/history`), jamais
 * sur une page déjà reçue : `q` (`filter[search]`), `moyen` (`filter[payment_method]`), `status`,
 * `payer_id`, `landlord_id`, le bien (`entity_type=property` + `entity_id`), `date_from` / `date_to`,
 * `period`. `entity_type` / `entity_id` venus d'un lien (bail, client, réservation) restent lus, sans
 * pastille à l'écran (le lien d'un bail ouvre ses paiements, et le dit : « Bail » en tête).
 *
 * - **Téléphone** : recherche, pastilles de moyen, une ligne de compte, puis des cartes groupées par
 *   jour avec le total du jour (sauf un jour coupé par la page : `grouperParJour`).
 * - **Bureau** : la barre de filtres, la bande des totaux (registre seulement), la table — payeur
 *   d'abord, la référence en dernier, discrète.
 *
 * Les totaux sont ceux de `meta.totals` (le serveur somme TOUTE la sélection) ; les comptes « payé »
 * et « échoué » viennent de deux lectures `per_page=1` aux mêmes filtres, jamais de la page.
 */

const PAR_PAGE = 20;

/**
 * Les colonnes du registre au bureau, celles de la maquette (`COLS_ENCAISSEMENTS`, `_ETROIT` sous
 * 1440 px) : des colonnes FIXES en pixels de maquette — donc en `rem`, que la densité ne réduit pas
 * (montant 112 px, moyen 128, date 100, statut 96, référence 92, plus l'écart de 14,4 px ; sous
 * 1440 px : montant 96, date 72, la référence passe sous le statut ; la colonne Montant s'en écarte
 * sous 1440 px pour tenir dix chiffres, TCK-2720) — et trois colonnes en `fr`
 * (payeur 1,35, bien 1,15, période 1) qui se partagent le reste. La table est en `table-fixed` :
 * sans lui, la largeur suit le contenu (« Pièce indépendante à Grand Yoff » ouvrait la colonne du
 * bien à 314 px). Le payeur, sans largeur, prend ce qui reste ; bien et période portent leur part
 * `fr` en POURCENTAGE de la table, juste à 1280 et à 1440 (table de 946 et 1106 px) : Chrome ignore
 * une largeur de colonne en `calc(% − rem)` (mesuré : les trois colonnes revenaient égales).
 * La table défile dans son conteneur sous 880 px (`min-w-[55rem]`, le `TableDefilante` de la maquette).
 */
const COLONNES = {
  payeur: 'align-middle',
  bien: 'align-middle w-[16.84%] min-[90rem]:w-[14.69%]',
  periode: 'align-middle w-[14.84%] min-[90rem]:w-[12.95%]',
  // TCK-2720 — dix chiffres (« 1 234 567 890 F », et « 1,234,567,890 F », plus large) tiennent dans
  // la cellule : 102 px de texte sous `lg` (text-sm à 14 px, px-3 = 24 px), 91,8 px de `lg` à 1440
  // (12,6 px, 21,6 px). Les 110,4 px de la maquette n'en laissaient que 86,4 et 88,8 (mesuré).
  montant: 'align-middle whitespace-nowrap w-[8.1rem] lg:w-[7.3rem] min-[90rem]:w-[7.9rem]',
  moyen: 'align-middle whitespace-nowrap w-[8.9rem]',
  date: 'align-middle whitespace-nowrap w-[5.4rem] min-[90rem]:w-[7.15rem]',
  statut: 'align-middle w-[7.51rem] min-[90rem]:w-[6.9rem]',
  reference: 'align-middle hidden w-[7.25rem] min-[90rem]:table-cell',
} as const;
/** L'ordre des pastilles de moyen : celui de la maquette (Wave, Orange Money, Espèces, Virement), puis le reste de l'enum. */
const MOYENS_PAR_USAGE = ['wave', 'orange_money', 'cash', 'bank_transfer', 'free_money', 'mobile_money', 'card', 'check'] as const satisfies readonly (typeof PAYMENT_METHOD_VALUES)[number][];

function entier(valeur: string | null): number | undefined {
  if (!valeur) return undefined;
  const n = Number.parseInt(valeur, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function useAdresse() {
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();
  const poser = (changements: Record<string, string | null>) => {
    const params = new URLSearchParams(recherche.toString());
    for (const [cle, valeur] of Object.entries(changements)) {
      if (valeur === null || valeur === '') params.delete(cle);
      else params.set(cle, valeur);
    }
    if (!('page' in changements)) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${chemin}?${qs}` : chemin, { scroll: false });
  };
  return { recherche, poser };
}

/**
 * TCK-2659 (D2, décision du 2026-11-11) — les statuts d'une échéance NON payée : elle n'a pas de `paid_at`,
 * et un registre borné par l'encaissement la rendrait vide à coup sûr. Filtrée sur l'un d'eux, la lecture
 * borne par `date_from` / `date_to` (l'échéance de la période) ; sans statut, ou sur un statut encaissé
 * (`paid`, `refunded`), par `paid_from` / `paid_to`.
 */
const STATUTS_NON_PAYES: ReadonlySet<string> = new Set(['late', 'pending', 'failed', 'partially_paid', 'cancelled']);

/** Les bornes d'une lecture selon son statut (la règle de D2) : l'échéance sous un statut non payé, l'encaissement sinon. */
function bornesSelonLeStatut(du: string | undefined, au: string | undefined, statut: string | undefined): Pick<UsePaymentsHistoryParams, 'date_from' | 'date_to' | 'paid_from' | 'paid_to'> {
  return statut !== undefined && STATUTS_NON_PAYES.has(statut) ? { date_from: du, date_to: au } : { paid_from: du, paid_to: au };
}

/** Les paramètres de la lecture, tirés de l'adresse — la même pour la liste et pour ses totaux. */
export function parametresDesEncaissements(recherche: { get(nom: string): string | null }, courant: string): UsePaymentsHistoryParams {
  const { du, au } = bornesDesEncaissements(recherche, courant);
  const entityType = recherche.get('entity_type') as PaymentHistoryEntity | null;
  const moyen = recherche.get('moyen');
  // Un statut que l'écran ne connaît pas (`status=completed`, lien ancien ou tapé) vaut « tous » : il
  // ne part pas à l'API et ne se traduit pas (vérification de TCK-2677).
  const statutLu = recherche.get('status');
  const statut = statutLu && (PAYMENT_STATUS_VALUES as readonly string[]).includes(statutLu) ? statutLu : undefined;
  return {
    page: entier(recherche.get('page')) ?? 1,
    per_page: PAR_PAGE,
    status: statut,
    entity_type: entityType || undefined,
    entity_id: entityType ? entier(recherche.get('entity_id')) : undefined,
    // TCK-2659 (M1) — un registre d'ENCAISSEMENTS se borne par la date d'encaissement (`paid_at`), comme
    // la tuile « Encaissé en <mois> » : le loyer d'octobre réglé le 3 novembre est un encaissement de
    // novembre. Les dates posées (Du / Au) aussi. Sauf sous un statut non payé ({@link STATUTS_NON_PAYES}).
    ...bornesSelonLeStatut(du, au, statut),
    payer_id: entier(recherche.get('payer_id')),
    landlord_id: entier(recherche.get('landlord_id')),
    payment_method: moyen ? [moyen] : undefined,
    search: recherche.get('q') || undefined,
    include: ['payer', 'property', 'landlord'],
  };
}

export function EncaissementsAgence({
  courant,
  telephone,
  variante,
  agencyId,
}: {
  readonly courant: string;
  readonly telephone: boolean;
  /** `registre` : la page des encaissements ; `apercu` : sous le point du mois (bureau). */
  readonly variante: 'registre' | 'apercu';
  readonly agencyId: number | undefined;
}) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const f = useFormatteurs();
  const { recherche, poser } = useAdresse();
  const params = parametresDesEncaissements(recherche, courant);
  const { mois } = bornesDesEncaissements(recherche, courant);
  const query = usePaymentsHistory(params);
  const avecTotaux = !telephone && variante === 'registre' && !params.status;
  // TCK-2659 (contre-vérification, N1) — chaque lecture de la bande suit la règle de D2 pour SON statut :
  // « Échoué » borne par l'échéance (un paiement échoué n'a jamais de `paid_at` : en `paid_*`, la cellule
  // valait 0 pour tout mois). « Restant dû » vient d'une lecture SANS statut bornée par l'échéance : le reste
  // des échéances de la période (celles payées dans le mois ont un reste nul) ; en `paid_*`, il ne comptait
  // jamais les impayés du mois. Total et Payé restent ceux du registre (`paid_*`).
  const { page: _page, paid_from: duPaye, paid_to: auPaye, date_from: duEcheance, date_to: auEcheance, ...sansPage } = params;
  const du = duPaye ?? duEcheance;
  const au = auPaye ?? auEcheance;
  const bande = { ...sansPage, per_page: 1, include: undefined, enabled: avecTotaux };
  const payes = usePaymentsHistory({ ...bande, ...bornesSelonLeStatut(du, au, 'paid'), status: 'paid' });
  const echoues = usePaymentsHistory({ ...bande, ...bornesSelonLeStatut(du, au, 'failed'), status: 'failed' });
  const echeances = usePaymentsHistory({ ...bande, date_from: du, date_to: au, status: undefined });

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const totals = meta?.totals;
  // TCK-2733 — le registre garde les cautions, que la tuile « Encaissé » exclut : il dit leur part,
  // seulement quand il y en a.
  const cautions = totals?.deposits_amount ? { montant: f.montantCourt(totals.deposits_amount), count: totals.deposits_count ?? 0 } : null;
  const nomDuMois = mois ? f.date(dateDuMois(mois), { month: 'long', timeZone: 'UTC' }) : null;

  // Le libellé d'un choix porté par l'adresse : la première ligne le nomme (toutes la partagent). Sans
  // ligne, aucun nom : jamais « #42 » (la pastille en garde l'encre, cf. `ChoixAvecRecherche`).
  const premier = rows[0];
  const libelles = {
    payeur: params.payer_id ? (premier?.payer?.name ?? null) : null,
    bien: params.entity_type === 'property' && params.entity_id ? (premier?.property?.title ?? null) : null,
    bailleur: params.landlord_id ? (premier?.landlord?.name ?? null) : null,
  };

  const filtres = (
    <FiltresDesEncaissements
      telephone={telephone}
      variante={variante}
      params={params}
      libelles={libelles}
      agencyId={agencyId}
      poser={poser}
      compte={meta && nomDuMois ? t('compteDuMois', { count: meta.total, mois: nomDuMois }) : null}
    />
  );

  return (
    <div data-testid="encaissements-agence" className={cn(telephone ? 'space-y-0' : 'space-y-4')}>
      {filtres}

      {telephone && meta ? (
        <p className="px-1 pb-1 text-ui text-muted-foreground">
          {t.rich('resume', {
            // En tête de phrase : « Novembre · 214 paiements · … ».
            mois: nomDuMois ? nomDuMois.charAt(0).toLocaleUpperCase() + nomDuMois.slice(1) : t('toutesDates'),
            count: meta.total,
            montant: f.montantCourt(totals?.paid_amount ?? 0),
            fort: (morceau) => <span className="font-semibold text-foreground tabular-nums">{morceau}</span>,
          })}
          {cautions ? <span data-testid="resume-cautions"> · {t('resumeCautions', { montant: cautions.montant })}</span> : null}
        </p>
      ) : null}

      {avecTotaux && totals ? (
        <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-card max-xl:grid-cols-2">
          <CelluleDeTotal
            libelle={t('totaux.total')}
            valeur={f.montantCourt(totals.amount)}
            detail={t('totaux.lignes', { count: totals.count })}
            complement={cautions ? t('totaux.dontCautions', cautions) : null}
          />
          <CelluleDeTotal
            libelle={t('totaux.paye')}
            valeur={f.montantCourt(totals.paid_amount)}
            detail={payes.data ? t('totaux.paiements', { count: payes.data.meta.total }) : null}
          />
          <CelluleDeTotal
            libelle={t('totaux.restant')}
            valeur={echeances.data?.meta.totals ? f.montantCourt(echeances.data.meta.totals.remaining_amount) : '—'}
            detail={t('totaux.aEncaisser')}
          />
          <CelluleDeTotal
            libelle={t('totaux.echoue')}
            valeur={echoues.data?.meta.totals ? f.montantCourt(echoues.data.meta.totals.amount) : '—'}
            detail={echoues.data ? t('totaux.aReprendre', { count: echoues.data.meta.total }) : null}
          />
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-3 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-ui text-muted-foreground">
          {t('erreur')}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Wallet className="size-8" aria-hidden="true" />} title={t('videTitre')} description={t('videDetail')} />
      ) : telephone ? (
        <JoursDEncaissements rows={rows} page={meta?.current_page ?? 1} derniere={meta?.last_page ?? 1} onPage={(p) => poser({ page: String(p) })} />
      ) : (
        <TableDesEncaissements rows={rows} meta={meta} onPage={(p) => poser({ page: p > 1 ? String(p) : null })} />
      )}
    </div>
  );
}

function CelluleDeTotal({
  libelle,
  valeur,
  detail,
  complement = null,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly detail: string | null;
  readonly complement?: string | null;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-ui text-muted-foreground">{libelle}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{valeur}</p>
      <p className="text-ui text-muted-foreground">{detail ?? ' '}</p>
      {complement ? (
        <p data-testid="total-dont-cautions" className="text-ui tabular-nums text-muted-foreground">
          {complement}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────── Filtres ──────────────────────────────────────────── */

interface ProprietesDesFiltres {
  readonly telephone: boolean;
  readonly variante: 'registre' | 'apercu';
  readonly params: UsePaymentsHistoryParams;
  readonly libelles: { readonly payeur: string | null; readonly bien: string | null; readonly bailleur: string | null };
  readonly agencyId: number | undefined;
  readonly poser: (changements: Record<string, string | null>) => void;
  readonly compte: string | null;
}

function FiltresDesEncaissements({ telephone, variante, params, libelles, agencyId, poser, compte }: ProprietesDesFiltres) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const tMoyens = useTranslations('payments.methods');
  const tStatus = useTranslations('payments.status');
  const moyen = params.payment_method?.[0] ?? null;
  const optionsDeMoyen: OptionDeChoix[] = MOYENS_PAR_USAGE.map((m) => ({ value: m, label: tMoyens(m) }));
  const optionsDeStatut: OptionDeChoix[] = PAYMENT_STATUS_VALUES.map((s) => ({ value: s, label: tStatus(s) }));

  const recherche = (
    <DebouncedSearchInput
      value={params.search ?? ''}
      onCommit={(q) => poser({ q: q.trim() || null })}
      placeholder={telephone ? t('rechercheCourte') : t('recherche')}
      aria-label={t('recherche')}
      className={telephone ? 'min-w-0 flex-1' : variante === 'registre' ? 'w-94 min-w-0' : 'w-100 min-w-0'}
    />
  );

  const statut = (
    <ChoixDansUneListe
      libelle={t('statut')}
      choisi={params.status && tStatus.has(params.status) ? tStatus(params.status) : null}
      options={optionsDeStatut}
      value={params.status ?? null}
      onChange={(v) => poser({ status: v })}
      tous={t('tousLesStatuts')}
    />
  );
  const choixAvances = (
    <>
      <ChoixDuPayeur value={params.payer_id ? String(params.payer_id) : null} choisi={libelles.payeur} onChange={(o) => poser({ payer_id: o?.value ?? null })} />
      <ChoixDuBien
        value={params.entity_type === 'property' && params.entity_id ? String(params.entity_id) : null}
        choisi={libelles.bien}
        onChange={(o) => poser({ entity_type: o ? 'property' : null, entity_id: o?.value ?? null })}
      />
      <ChoixDuBailleur agencyId={agencyId} value={params.landlord_id ? String(params.landlord_id) : null} choisi={libelles.bailleur} onChange={(o) => poser({ landlord_id: o?.value ?? null })} />
    </>
  );

  if (telephone) {
    return (
      <>
        <div className="flex gap-2">
          {recherche}
          <FeuilleDuBas
            titre={t('filtres')}
            declencheur={
              <button
                type="button"
                aria-label={t('filtres')}
                className="inline-flex size-11 flex-none items-center justify-center rounded-lg border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <SlidersHorizontal className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          >
            <div className="flex flex-wrap gap-2 pb-2">
              {statut}
              {choixAvances}
            </div>
            <ChampsDesDates poser={poser} />
          </FeuilleDuBas>
        </div>
        <RangeeDePuces aria-label={t('moyen')} className="-mx-4">
          <PuceDeFiltre active={moyen === null} onClick={() => poser({ moyen: null })}>
            {t('tous')}
          </PuceDeFiltre>
          {MOYENS_PAR_USAGE.slice(0, 5).map((m) => (
            <PuceDeFiltre key={m} active={moyen === m} onClick={() => poser({ moyen: moyen === m ? null : m })}>
              {tMoyens(m)}
            </PuceDeFiltre>
          ))}
        </RangeeDePuces>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 max-xl:flex-wrap">
      {recherche}
      {variante === 'registre' ? (
        choixAvances
      ) : (
        <ChoixDuBailleur agencyId={agencyId} value={params.landlord_id ? String(params.landlord_id) : null} choisi={libelles.bailleur} onChange={(o) => poser({ landlord_id: o?.value ?? null })} />
      )}
      <ChoixDansUneListe libelle={t('moyen')} choisi={moyen ? tMoyens(moyen) : null} options={optionsDeMoyen} value={moyen} onChange={(v) => poser({ moyen: v })} tous={t('tousLesMoyens')} />
      {statut}
      {variante === 'registre' ? <ChoixDesDates poser={poser} /> : null}
      {variante === 'apercu' && compte ? <span className="ml-auto text-ui text-muted-foreground">{compte}</span> : null}
    </div>
  );
}

function ChoixDuPayeur({ value, choisi, onChange }: { readonly value: string | null; readonly choisi: string | null; readonly onChange: (o: OptionDeChoix | null) => void }) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const etat = useEtatDeRecherche();
  const { options, chargement } = useOptionsDesPayeurs(etat);
  return <ChoixAvecRecherche libelle={t('payeur')} choisi={choisi} value={value} onChange={onChange} etat={etat} options={options} chargement={chargement} placeholder={t('chercherPayeur')} />;
}

function ChoixDuBien({ value, choisi, onChange }: { readonly value: string | null; readonly choisi: string | null; readonly onChange: (o: OptionDeChoix | null) => void }) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const etat = useEtatDeRecherche();
  const { options, chargement } = useOptionsDesBiens(etat);
  return <ChoixAvecRecherche libelle={t('bien')} choisi={choisi} value={value} onChange={onChange} etat={etat} options={options} chargement={chargement} placeholder={t('chercherBien')} />;
}

function ChoixDuBailleur({
  value,
  choisi,
  onChange,
  agencyId,
}: {
  readonly value: string | null;
  readonly choisi: string | null;
  readonly onChange: (o: OptionDeChoix | null) => void;
  readonly agencyId: number | undefined;
}) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const etat = useEtatDeRecherche();
  const { options, chargement } = useOptionsDesBailleurs(etat, agencyId);
  return <ChoixAvecRecherche libelle={t('bailleur')} choisi={choisi} value={value} onChange={onChange} etat={etat} options={options} chargement={chargement} placeholder={t('chercherBailleur')} />;
}

function ChampsDesDates({ poser }: { readonly poser: ProprietesDesFiltres['poser'] }) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const recherche = useSearchParams();
  // Les champs ne montrent que des bornes EXPLICITES : celles d'un mois se changent au sélecteur.
  const du = recherche.get('date_from') ?? '';
  const au = recherche.get('date_to') ?? '';
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1 text-ui text-muted-foreground">
        <span>{t('du')}</span>
        <Input type="date" value={du} onChange={(e) => poser({ date_from: e.target.value || null })} />
      </label>
      <label className="space-y-1 text-ui text-muted-foreground">
        <span>{t('au')}</span>
        <Input type="date" value={au} onChange={(e) => poser({ date_to: e.target.value || null })} />
      </label>
    </div>
  );
}

function ChoixDesDates({ poser }: { readonly poser: ProprietesDesFiltres['poser'] }) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const f = useFormatteurs();
  const recherche = useSearchParams();
  const [ouvert, setOuvert] = useState(false);
  const du = recherche.get('date_from');
  const au = recherche.get('date_to');
  const choisi = du || au ? [du ? f.jourMois(`${du}T12:00:00Z`) : '…', au ? f.jourMois(`${au}T12:00:00Z`) : '…'].join(' – ') : null;
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger
        aria-label={choisi ? `${t('dates')} : ${choisi}` : t('dates')}
        data-choisi={choisi !== null}
        className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring data-[choisi=true]:border-foreground"
      >
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
        {choisi ?? t('dates')}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <ChampsDesDates poser={poser} />
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────────────────────── Téléphone ────────────────────────────────────────── */

function JoursDEncaissements({
  rows,
  page,
  derniere,
  onPage,
}: {
  readonly rows: readonly PaymentHistoryRow[];
  readonly page: number;
  readonly derniere: number;
  readonly onPage: (page: number) => void;
}) {
  const t = useTranslations('admin.finances.argent');
  const f = useFormatteurs();
  const { aujourdhui, hier } = joursRecents();
  const nomDuJour = (jour: string | null) => {
    if (!jour) return '—';
    if (jour === aujourdhui) return t('jour.aujourdhui');
    if (jour === hier) return t('jour.hier');
    const texte = f.date(`${jour}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'short' });
    return texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
  };

  return (
    <div className="pb-8">
      {grouperParJour(rows, { courante: page, derniere }).map((groupe, i) => (
        <section key={`${groupe.jour ?? 'sans-date'}-${i}`} aria-label={nomDuJour(groupe.jour)}>
          <div className="flex items-baseline justify-between px-1 pb-2 pt-4">
            <h2 className="text-sm font-semibold">{nomDuJour(groupe.jour)}</h2>
            {groupe.total !== null ? <span className="text-ui tabular-nums text-muted-foreground">{f.montantCourt(groupe.total)}</span> : null}
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {groupe.lignes.map((row) => (
              <LigneDEncaissementTelephone key={`${row.source}-${row.id}`} row={row} sansJour />
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-col items-center gap-3 pt-5">
        {page < derniere ? (
          <button type="button" onClick={() => onPage(page + 1)} className="text-sm font-medium text-primary outline-none focus-visible:underline">
            {t('encaissements.precedents')}
          </button>
        ) : null}
        {page > 1 ? (
          <button type="button" onClick={() => onPage(1)} className="text-sm font-medium text-muted-foreground outline-none focus-visible:underline">
            {t('encaissements.recents')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── Bureau ──────────────────────────────────────────── */

function lienDeLaLigne(row: PaymentHistoryRow): string | null {
  if (row.lease_id) return `/app/leases/${row.lease_id}`;
  if (row.booking_id) return `/app/bookings/${row.booking_id}`;
  return null;
}

function TableDesEncaissements({
  rows,
  meta,
  onPage,
}: {
  readonly rows: readonly PaymentHistoryRow[];
  readonly meta: { readonly current_page: number; readonly last_page: number; readonly total: number; readonly per_page: number } | undefined;
  readonly onPage: (page: number) => void;
}) {
  const t = useTranslations('admin.finances.argent.encaissements');
  const tPagination = useTranslations('console.pagination');
  const f = useFormatteurs();
  const l = useLectureDEncaissement();
  const page = meta?.current_page ?? 1;
  const derniere = meta?.last_page ?? 1;
  const debut = (page - 1) * (meta?.per_page ?? PAR_PAGE) + 1;
  const fin = debut + rows.length - 1;

  const colonnes: DataTableColumn<PaymentHistoryRow>[] = [
    {
      id: 'payeur',
      header: t('colonnes.payeur'),
      className: COLONNES.payeur,
      cell: (row) => {
        const href = lienDeLaLigne(row);
        const nom = l.nom(row);
        return (
          <span className="flex min-w-0 items-center gap-2.5">
            <AvatarDuPayeur nom={nom} taille="32" />
            <span className="min-w-0 leading-tight">
              {href ? (
                <Link href={href} className="block truncate font-medium underline-offset-2 hover:underline">
                  {nom}
                </Link>
              ) : (
                <span className="block truncate font-medium">{nom}</span>
              )}
              {row.source === 'booking' ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{t('reservation')}</span> : null}
            </span>
          </span>
        );
      },
    },
    {
      id: 'bien',
      header: t('colonnes.bien'),
      className: COLONNES.bien,
      cell: (row) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate">{l.bien(row) ?? '—'}</span>
          {row.landlord?.name ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{row.landlord.name}</span> : null}
        </span>
      ),
    },
    { id: 'periode', header: t('colonnes.periode'), className: COLONNES.periode, cell: (row) => <span className="leading-tight text-encre-douce">{l.periode(row)}</span> },
    {
      id: 'montant',
      header: t('colonnes.montant'),
      align: 'end',
      className: COLONNES.montant,
      cell: (row) => <span className={cn('font-semibold tabular-nums', row.status === 'failed' && 'font-normal text-muted-foreground line-through')}>{l.montant(row)}</span>,
    },
    {
      id: 'moyen',
      header: t('colonnes.moyen'),
      className: COLONNES.moyen,
      cell: (row) =>
        l.moyen(row) ? (
          <span className="inline-flex items-center gap-1.5">
            <IconeDeMoyen moyen={row.payment_method} className="text-muted-foreground" />
            {l.moyen(row)}
          </span>
        ) : (
          '—'
        ),
    },
    { id: 'date', header: t('colonnes.date'), className: COLONNES.date, cell: (row) => <span className="tabular-nums">{row.date ? f.jourMois(row.date) : '—'}</span> },
    {
      id: 'statut',
      header: t('colonnes.statut'),
      className: COLONNES.statut,
      cell: (row) => (
        <span className="block">
          <StatutEnPastille status={row.status} />
          <span className="mt-1 block truncate font-mono text-legende text-muted-foreground min-[90rem]:hidden">{row.reference_number ?? ''}</span>
        </span>
      ),
    },
    {
      id: 'reference',
      header: t('colonnes.reference'),
      className: COLONNES.reference,
      cell: (row) => <span className="block truncate font-mono text-xs text-muted-foreground">{row.reference_number ?? '—'}</span>,
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="max-xl:overflow-x-auto">
        <div className="min-w-[55rem]">
          <DataTable caption={t('legende')} columns={colonnes} rows={rows} rowKey={(row) => `${row.source}-${row.id}`} className="rounded-none border-0 [&_table]:table-fixed" />
        </div>
      </div>
      <div className="flex h-12 items-center gap-3 border-t border-border px-4 text-ui text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{t('pied', { debut, fin, total: meta?.total ?? rows.length })}</span>
        <span className="tabular-nums">{tPagination('positionSlash', { page: String(page), lastPage: String(derniere) })}</span>
        <button
          type="button"
          aria-label={tPagination('previous')}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={tPagination('next')}
          disabled={page >= derniere}
          onClick={() => onPage(page + 1)}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Bureau : le statut en pastille (« Payé », « En retard »…), le ton de `PAYMENT_STATUS_TONE`. */
function StatutEnPastille({ status }: { readonly status: string | null }) {
  return <StatutDEncaissement status={status} pastille />;
}
