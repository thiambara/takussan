'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftRight, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AdminFinancesTabs } from '@/components/admin/finances/AdminFinancesTabs';
import { parametresDesEncaissements } from '@/components/admin/finances/argent/EncaissementsAgence';
import { useGestesDeLArgent, type GestesDeLArgent } from '@/components/admin/finances/argent/gestes';
import { AFaireEtDerniers, PointDuMoisTelephone, TuilesDuMois, type ContexteDuPoint } from '@/components/admin/finances/argent/PointDuMois';
import { SelecteurDeMois, useTextesDuSelecteurDeMois } from '@/components/admin/finances/argent/SelecteurDeMois';
import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { bornesDesEncaissements, moisAffiche, vueDeLArgent, type OngletArgent } from '@/lib/finances/vue-argent';
import { dateDuMois, moisCourant } from '@/lib/finances/mois';
import { useFinanceSummary } from '@/lib/queries/agency-reporting';
import { lienDExportDuRegistre } from '@/lib/queries/exports';
import { usePaymentsHistory } from '@/lib/queries/payments';
import { ApiError } from '@/lib/api';

interface AdminFinancesClientProps {
  /**
   * `true` when the actor has at least one of the finance read perms
   * (`payments.view_in_agency`, `invoices.view_in_agency`,
   * `payouts.view_in_agency`). Resolved server-side and forwarded here so the
   * client can render the degraded state without re-fetching `auth/me`.
   */
  readonly canViewFinances: boolean;
  /**
   * `true` when the actor can write — issue invoices, launch payouts. Nécessaire, plus suffisant :
   * chaque geste suit aussi SA capacité (TCK-528).
   */
  readonly canEmitFinances: boolean;
  /** TCK-2260 — le rapprochement bancaire est ouvert à ce lecteur (`payments.reconcile`, `PAGES_ADMIN`). */
  readonly rapprochement?: boolean;
  /** L'agence de la page, résolue côté serveur. */
  readonly agencyId?: number;
}

const RACINE = '/app/agency/finances';

/**
 * TCK-2659 — « Argent » (`/app/agency/finances`), la page d'argent de l'agence (ADR-0100 § 4).
 *
 * - Sans `?tab=` : le POINT DU MOIS (tuiles, « À faire », derniers encaissements) ; au bureau, les
 *   registres suivent sous leurs onglets, et un onglet choisi ouvre son registre.
 * - Avec `?tab=` (ou un lien d'entité, `vueDeLArgent`) : le REGISTRE — un écran de détail au
 *   téléphone (flèche vers le point du mois), une page sous le fil « Argent › … » au bureau.
 *
 * Le mois (`?period=`) gouverne la synthèse et les encaissements ; l'adresse porte tout l'état.
 */
export function AdminFinancesClient({ canViewFinances, canEmitFinances, rapprochement = false, agencyId }: AdminFinancesClientProps) {
  const t = useTranslations('admin.finances');
  const tPage = useTranslations('admin.pages.finances');
  const f = useFormatteurs();
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();
  // Le téléphone est l'écran de la barre d'onglets du bas (sous `md`) : la même requête qu'elle.
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const courant = moisCourant();
  const vue = vueDeLArgent(recherche);
  const mois = moisAffiche(recherche, courant);
  const periodeDansLUrl = recherche.get('period');
  const gestes = useGestesDeLArgent(canEmitFinances);
  const textesDuMois = useTextesDuSelecteurDeMois();
  const synthese = useFinanceSummary(canViewFinances ? agencyId : undefined, mois);
  const { can: peutExporter } = useCan('payments.export');
  // La même lecture que la liste (même clé React Query : aucune requête de plus) — son compte nomme
  // l'en-tête du registre.
  const encaissements = usePaymentsHistory({ ...parametresDesEncaissements(recherche, courant), enabled: canViewFinances && (vue.sorte === 'registre' ? vue.onglet === 'encaissements' : !telephone) });

  if (!canViewFinances) {
    return (
      <div data-testid="finances-degraded" role="alert" className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-semibold text-foreground">{t('denied.title')}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('denied.body', { capabilities: 'payments.view_in_agency, invoices.view_in_agency, payouts.view_in_agency' })}
        </p>
      </div>
    );
  }

  const donnees = synthese.data?.data;
  // TCK-2721 — « Exporter » rend les lignes du REGISTRE, avec ses filtres (entité d'un lien entrant,
  // payeur, bien, bailleur, moyen, statut, recherche, bornes) : l'entité `payment_history`, servie par
  // la sélection même de la liste. Le lien porte les paramètres de l'écran au moment du clic, et son
  // nom accessible dit combien de lignes partent.
  const lienExport = peutExporter ? lienDExportDuRegistre(parametresDesEncaissements(recherche, courant)) : null;
  const bornesExport = bornesDesEncaissements(recherche, courant);
  const nomDuMois = (m: string) => f.date(dateDuMois(m), { month: 'long', timeZone: 'UTC' });
  const totalAffiche = encaissements.data?.meta.total;
  const ariaExport =
    totalAffiche !== undefined ? t('argent.actions.exporterAria', { count: totalAffiche }) : t('argent.actions.exporterAriaSansCompte');

  const ctx: ContexteDuPoint = {
    mois,
    periodeDansLUrl,
    synthese: donnees,
    syntheseEnCours: synthese.isLoading,
    syntheseRefusee: synthese.error instanceof ApiError && synthese.error.status === 403,
    gestes,
    rapprochement,
    lienExport,
  };

  const ouvrirOnglet = (onglet: OngletArgent) => {
    const params = new URLSearchParams();
    params.set('tab', onglet);
    if (periodeDansLUrl) params.set('period', periodeDansLUrl);
    router.replace(`${chemin}?${params.toString()}`, { scroll: false });
  };

  const comptes = { aApprouver: donnees?.payouts_awaiting_approval.count, impayes: donnees?.overdue.count };
  const racine = periodeDansLUrl ? `${RACINE}?period=${periodeDansLUrl}` : RACINE;
  const exporter = lienExport ? (
    <a href={lienExport} download className={buttonVariants({ variant: 'outline' })} aria-label={ariaExport}>
      <Download aria-hidden="true" />
      {t('argent.actions.exporter')}
    </a>
  ) : null;

  /* ── Le point du mois ── */
  if (vue.sorte === 'point') {
    if (telephone) {
      return (
        <>
          <DeclarerEnTete titre={tPage('title')} action={<SelecteurDeMois mois={mois} courant={courant} variante="telephone" textes={textesDuMois} />} />
          <PointDuMoisTelephone {...ctx} />
          {gestes.dialogues}
        </>
      );
    }
    return (
      <div>
        <PageHeader
          title={tPage('title')}
          description={donnees ? t('argent.auJour', { date: f.date(`${donnees.as_of}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' }) }) : undefined}
          actions={
            // Cinq actions mesurent ~690 px : entre `lg` et `xl` (largeur utile 694 à 1024), côte à côte
            // avec le titre elles l'écrasaient (mesuré à 1024). Elles passent à la ligne dans 432 px, à droite.
            <div className="flex flex-wrap items-center justify-end gap-2 lg:max-xl:max-w-[calc(var(--spacing)*120)]">
              <SelecteurDeMois mois={mois} courant={courant} variante="bureau" textes={textesDuMois} />
              {rapprochement ? (
                <Link href="/app/agency/finances/reconciliation" className={buttonVariants({ variant: 'outline' })}>
                  <ArrowLeftRight aria-hidden="true" />
                  {tPage('reconciliationLink')}
                </Link>
              ) : null}
              {exporter}
              <GestesDeCreation gestes={gestes} />
            </div>
          }
        />
        <div className="pt-6">
          <TuilesDuMois {...ctx} />
          <AFaireEtDerniers {...ctx} />
          <div className="mt-10">
            <AdminFinancesTabs
              onglet="encaissements"
              onChange={ouvrirOnglet}
              gestes={gestes}
              telephone={false}
              variante="apercu"
              courant={courant}
              agencyId={agencyId}
              comptes={comptes}
            />
          </div>
        </div>
        {gestes.dialogues}
      </div>
    );
  }

  /* ── Un registre ── */
  const titres: Record<OngletArgent, string> = {
    encaissements: t('tabs.payments'),
    factures: t('tabs.invoices'),
    reversements: t('tabs.payouts'),
    'a-approuver': t('tabs.toApprove'),
    impayes: t('tabs.overdue'),
  };
  const onglet = vue.onglet === 'a-approuver' && !gestes.peutApprouver ? 'encaissements' : vue.onglet;
  const total = encaissements.data?.meta.total;
  const description =
    onglet === 'encaissements' && total !== undefined
      ? bornesExport.mois
        ? t('argent.encaissements.sousTitre', { count: total, mois: nomDuMois(bornesExport.mois) })
        : t('argent.encaissements.sousTitreSansMois', { count: total })
      : undefined;

  const actions =
    onglet === 'encaissements' ? (
      <>
        <SelecteurDeMois mois={bornesExport.mois} courant={courant} variante="bureau" textes={textesDuMois} />
        {exporter}
      </>
    ) : onglet === 'factures' || onglet === 'reversements' || onglet === 'a-approuver' ? (
      <GestesDeCreation gestes={gestes} seul={onglet === 'factures' ? 'facture' : 'reversement'} />
    ) : undefined;

  const registres = (
    <AdminFinancesTabs
      onglet={onglet}
      onChange={ouvrirOnglet}
      gestes={gestes}
      telephone={telephone}
      variante="registre"
      courant={courant}
      agencyId={agencyId}
      comptes={comptes}
      entete={(onglets) => (
        <PageHeader
          className="max-md:hidden"
          fil={{ label: t('argent.filLabel'), etapes: [{ label: tPage('title'), href: racine }, { label: titres[onglet] }] }}
          title={titres[onglet]}
          description={description}
          actions={actions}
          dessous={onglets}
        />
      )}
    />
  );

  return (
    <div>
      {telephone ? (
        <DeclarerEnTete
          forme="detail"
          titre={titres[onglet]}
          repli={racine}
          droite={
            onglet === 'encaissements' && lienExport ? (
              <a
                href={lienExport}
                download
                aria-label={ariaExport}
                className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
              >
                <Download className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </a>
            ) : undefined
          }
        />
      ) : null}
      {/* TCK-2691 — au téléphone, pleine largeur : l'écran pose la marge de la maquette (`px-4 pt-3`). */}
      {telephone ? (
        <PagePleineLargeur className="pb-8 pt-3">
          <div className="px-4">{registres}</div>
        </PagePleineLargeur>
      ) : (
        registres
      )}
      {gestes.dialogues}
    </div>
  );
}

/** « Générer une facture » et « Créer un reversement », chacun gardé par SA capacité (TCK-528). */
function GestesDeCreation({ gestes, seul }: { readonly gestes: GestesDeLArgent; readonly seul?: 'facture' | 'reversement' }) {
  const t = useTranslations('admin.finances');
  if (gestes.canEmit && gestes.capacitesEnCours) {
    return <Skeleton className="h-9 w-72 max-w-full" aria-hidden="true" data-testid="finances-actions-loading" />;
  }
  return (
    <>
      {gestes.emetFacture && seul !== 'reversement' ? (
        <Button type="button" variant="outline" onClick={gestes.nouvelleFacture}>
          {t('tabs.newInvoice')}
        </Button>
      ) : null}
      {gestes.emetReversement && seul !== 'facture' ? (
        <Button type="button" variant="outline" onClick={gestes.nouveauReversement}>
          {t('tabs.newPayout')}
        </Button>
      ) : null}
    </>
  );
}
