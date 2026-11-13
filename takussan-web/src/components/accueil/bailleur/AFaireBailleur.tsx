'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, ChevronRight, FileText, MessageSquareReply, Wallet } from 'lucide-react';

import { LigneDeVisite } from '@/components/accueil/admin/LigneDeVisite';
import { ErreurDeBloc, SqueletteDeCarte, ToutEstAJour } from '@/components/accueil/EtatsDeBloc';
import { CarteAFaire, CarteFile, GroupeAFaire, LienTonal, RangeeAFaire, TitreBloc, TitreColonne } from '@/components/accueil/pieces';
import { Button, buttonVariants } from '@/components/ui/button';
import { aUneLigne, etatDeLaRequete, etatDuBloc, type EtatDeFile } from '@/lib/accueil/a-faire';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { useVisitesAConfirmer } from '@/lib/queries/accueil';
import { useLoyersEnRetard } from '@/lib/queries/accueil-bailleur';
import { useDevisAttendantLeBailleur } from '@/lib/queries/maintenance-signalement';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';
import type { PropertyVisit } from '@/types/visit';

import { CarteDeVisite } from './CarteDeVisite';
import { FeuilleDuDevis } from './FeuilleDuDevis';

/**
 * TCK-2624 (lot 2, maquette `app-accueil` a, écrans « Bailleur » et « Rien à faire (bailleur) ») —
 * « À faire maintenant » du bailleur et de l'hôte : ce qui attend SA réponse.
 *
 *  - **Téléphone** : une carte par visite à confirmer et par devis à valider, avec leurs deux boutons
 *    de 44 px (la maquette ne pose pas les loyers en retard au téléphone : « Ce mois » les dit).
 *  - **Bureau** : les groupes « Visites à confirmer », « Devis à valider », « Loyers en retard ».
 *  - **L'hôte** (`hote` non nul) a en plus « Réservations à traiter » et « Avis sans réponse », lus
 *    comme la Vue bailleur les lisait (`GET /api/dashboard/owner`) : aucune régression.
 *
 * Le bailleur d'un bien d'agence ne confirme pas une visite (`PropertyVisitPolicy::agitPourLeBien`,
 * décision 7) : `confirmeLesVisites = false` lui donne « Voir ». Un geste que l'API refuse (403)
 * devient « Voir » de même.
 */

export interface FilesDeLHote {
  readonly reservations: EtatDeFile;
  readonly avis: EtatDeFile;
}

const DESTINATIONS = {
  visites: '/app/visits?vue=to_confirm',
  devis: '/app/maintenance',
  loyers: '/app/payments?tab=history',
  loyer: (row: PaymentHistoryRow) => (row.lease_id ? `/app/leases/${row.lease_id}` : '/app/payments?tab=history'),
  reservations: '/app/bookings?status=pending',
  avis: '/app/profile/reviews?reply=unreplied&subject=property',
} as const;

export function AFaireBailleur({
  landlordId,
  confirmeLesVisites,
  hote = null,
}: {
  /** Le compte du bailleur : `filter[landlord_id]` des loyers en retard. */
  readonly landlordId: number;
  readonly confirmeLesVisites: boolean;
  readonly hote?: FilesDeLHote | null;
}) {
  const t = useTranslations('accueil.bailleur');
  const tBlocs = useTranslations('accueil.blocs');
  const visites = useVisitesAConfirmer(true);
  const devis = useDevisAttendantLeBailleur();
  const loyers = useLoyersEnRetard(landlordId, true);
  const [devisOuvert, setDevisOuvert] = useState<InterventionEnFile | null>(null);
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set());
  const refuser = (cle: string) => setRefuses((avant) => new Set(avant).add(cle));

  const etats = {
    visites: etatDeLaRequete(visites, (d) => d.meta.total),
    devis: etatDeLaRequete(devis, (d) => d.meta.total),
    loyers: etatDeLaRequete(loyers, (d) => d.meta.total),
  };
  const files: EtatDeFile[] = [etats.visites, etats.devis, etats.loyers, ...(hote ? [hote.reservations, hote.avis] : [])];
  const bloc = etatDuBloc(files);
  const reessayer = () => {
    for (const q of [visites, devis, loyers]) if (q.isError) void q.refetch();
  };

  const lignes: Lignes = {
    visites: aUneLigne(etats.visites) ? (visites.data?.data ?? []) : [],
    devis: aUneLigne(etats.devis) ? (devis.data?.data ?? []) : [],
    loyers: aUneLigne(etats.loyers) ? (loyers.data?.data ?? []).filter((r) => r.source === 'lease') : [],
    etats,
    hote,
    refuses,
    refuser,
    confirmeLesVisites,
    ouvrirDevis: setDevisOuvert,
  };

  let corps: ReactNode;
  if (bloc === 'chargement') {
    corps = (
      <ul className="space-y-3 max-md:px-4" aria-busy="true">
        <SqueletteDeCarte />
        <SqueletteDeCarte />
      </ul>
    );
  } else if (bloc === 'echec') {
    corps = <ErreurDeBloc quoi={tBlocs('quoi.aFaire')} onReessayer={reessayer} className="max-md:mx-4" />;
  } else if (bloc === 'aJour') {
    corps = hote ? (
      <ToutEstAJour texte={t('toutEstAJourHote')} className="max-md:mx-4" />
    ) : (
      <ToutEstAJour
        texte={t('toutEstAJour')}
        className="max-md:mx-4"
        action={
          <Link href="/app/properties/new" className={buttonVariants({ variant: 'outline' })}>
            {t('proposerUnBien')}
          </Link>
        }
      />
    );
  } else {
    corps = (
      <>
        <CartesDuTelephone l={lignes} />
        <GroupesDuBureau l={lignes} />
        {files.some((f) => f.etat === 'echec') ? <ErreurDeBloc quoi={tBlocs('quoi.uneFile')} onReessayer={reessayer} className="mt-3 max-md:mx-4" /> : null}
      </>
    );
  }

  return (
    <section data-slot="a-faire" aria-labelledby="a-faire-titre">
      <div className="md:hidden">
        <TitreBloc id="a-faire-titre">{t('titre')}</TitreBloc>
      </div>
      <div className="mb-2 max-md:hidden">
        <TitreColonne>{t('titre')}</TitreColonne>
      </div>
      <div className="max-md:mt-2">{corps}</div>
      {devisOuvert ? (
        <FeuilleDuDevis
          devis={devisOuvert}
          onFermer={() => setDevisOuvert(null)}
          onRefuse={() => {
            refuser(`devis-${devisOuvert.id}`);
            setDevisOuvert(null);
          }}
        />
      ) : null}
    </section>
  );
}

interface Lignes {
  readonly visites: readonly PropertyVisit[];
  readonly devis: readonly InterventionEnFile[];
  readonly loyers: readonly PaymentHistoryRow[];
  readonly etats: { readonly visites: EtatDeFile; readonly devis: EtatDeFile; readonly loyers: EtatDeFile };
  readonly hote: FilesDeLHote | null;
  readonly refuses: ReadonlySet<string>;
  readonly refuser: (cle: string) => void;
  readonly confirmeLesVisites: boolean;
  readonly ouvrirDevis: (d: InterventionEnFile) => void;
}

/** « Remplacement d'un chauffe-eau » · « Appartement F3, Liberté 6 · Astou Sy » · 85 000 F. */
function useLectureDuDevis() {
  const f = useFormatteurs();
  return (d: InterventionEnFile) => ({
    lieu: [d.property?.title ?? null, d.assignee?.name ?? null].filter(Boolean).join(' · '),
    montant: d.quote_amount !== null ? f.montantCourt(d.quote_amount, d.quote_currency ?? undefined) : null,
  });
}

/* ───────────────────────────────────────────── Téléphone ───────────────────────────────────────────── */

function CartesDuTelephone({ l }: { readonly l: Lignes }) {
  const t = useTranslations('accueil.bailleur');
  const lireDevis = useLectureDuDevis();
  return (
    <ul data-slot="a-faire-telephone" className="space-y-3 px-4 md:hidden">
      {l.visites.map((v) => (
        <CarteDeVisite key={v.id} v={v} geste={l.confirmeLesVisites && !l.refuses.has(`visite-${v.id}`)} onRefus={() => l.refuser(`visite-${v.id}`)} />
      ))}
      {l.devis.map((d) => {
        const lu = lireDevis(d);
        return (
          <CarteAFaire
            key={d.id}
            icone={FileText}
            titre={t('devis.titre')}
            quand={lu.montant}
            detail={[d.title, lu.lieu].filter(Boolean).join(' · ')}
            secondaire={
              <Link href={`/app/maintenance/${d.id}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                {t('devis.voir')}
              </Link>
            }
            primaire={
              l.refuses.has(`devis-${d.id}`) ? null : (
                <Button size="lg" className="font-semibold" onClick={() => l.ouvrirDevis(d)}>
                  {t('devis.valider')}
                </Button>
              )
            }
          />
        );
      })}
      <FilesDeLHoteEnCartes hote={l.hote} />
      <AutresDuTelephone l={l} />
    </ul>
  );
}

/**
 * « Voir les 6 autres visites à confirmer › » : ce que le plafond de la file ne montre pas
 * (`LiensAutres` de la maquette, écran agent), les mêmes libellés que les pieds du bureau.
 */
function AutresDuTelephone({ l }: { readonly l: Lignes }) {
  const t = useTranslations('accueil.bailleur');
  const liens = (
    [
      ['visites', l.etats.visites, l.visites.length, DESTINATIONS.visites],
      ['devis', l.etats.devis, l.devis.length, DESTINATIONS.devis],
    ] as const
  ).flatMap(([cle, e, montrees, href]) => {
    const n = e.etat === 'pret' ? e.total - montrees : 0;
    return n > 0 && montrees > 0 ? [{ cle, href, texte: t(`${cle}.autres`, { n }) }] : [];
  });
  if (liens.length === 0) return null;
  return (
    <li data-slot="autres-du-telephone" className="divide-y divide-border rounded-2xl border border-border bg-card">
      {liens.map((lien) => (
        <Link key={lien.cle} href={lien.href} className="flex h-11 items-center px-4 text-sm font-medium outline-none focus-visible:underline">
          <span className="min-w-0 flex-1 truncate">{lien.texte}</span>
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
      ))}
    </li>
  );
}

function FilesDeLHoteEnCartes({ hote }: { readonly hote: FilesDeLHote | null }) {
  const t = useTranslations('accueil.bailleur');
  if (!hote) return null;
  return (
    <>
      {aUneLigne(hote.reservations) ? (
        <CarteFile
          icone={CalendarCheck}
          titre={t('reservations.carte', { n: hote.reservations.total })}
          detail={t('reservations.detail')}
          action={<LienTonal href={DESTINATIONS.reservations} className="flex-none">{t('voir')}</LienTonal>}
        />
      ) : null}
      {aUneLigne(hote.avis) ? (
        <CarteFile
          icone={MessageSquareReply}
          titre={t('avis.carte', { n: hote.avis.total })}
          detail={t('avis.detail')}
          action={<LienTonal href={DESTINATIONS.avis} className="flex-none">{t('avis.repondre')}</LienTonal>}
        />
      ) : null}
    </>
  );
}

/* ───────────────────────────────────────────── Bureau ───────────────────────────────────────────── */

const TONAL_RANGEE = 'h-8 px-3 text-ui font-semibold';

function GroupesDuBureau({ l }: { readonly l: Lignes }) {
  const t = useTranslations('accueil.bailleur');
  const f = useFormatteurs();
  const lireDevis = useLectureDuDevis();
  const { etats } = l;
  const total = (e: EtatDeFile) => (e.etat === 'pret' ? e.total : undefined);
  const autres = (e: EtatDeFile, montrees: number) => (e.etat === 'pret' ? Math.max(0, e.total - montrees) : 0);
  const pied = (e: EtatDeFile, montrees: number, cle: 'visites' | 'devis' | 'loyers', href: string) =>
    autres(e, montrees) > 0 ? { texte: t(`${cle}.autres`, { n: autres(e, montrees) }), href } : null;

  return (
    <div data-slot="a-faire-bureau" className="space-y-5 max-md:hidden">
      {l.visites.length > 0 ? (
        <GroupeAFaire titre={t('groupes.visites')} compte={total(etats.visites)} toutVoir={DESTINATIONS.visites} pied={pied(etats.visites, l.visites.length, 'visites', DESTINATIONS.visites)}>
          {l.visites.map((v) => (
            <LigneDeVisite
              key={v.id}
              v={v}
              refusee={!l.confirmeLesVisites || l.refuses.has(`visite-${v.id}`)}
              onRefus={() => l.refuser(`visite-${v.id}`)}
            />
          ))}
        </GroupeAFaire>
      ) : null}

      {l.devis.length > 0 ? (
        <GroupeAFaire titre={t('groupes.devis')} compte={total(etats.devis)} toutVoir={DESTINATIONS.devis} pied={pied(etats.devis, l.devis.length, 'devis', DESTINATIONS.devis)}>
          {l.devis.map((d) => {
            const lu = lireDevis(d);
            return (
              <RangeeAFaire
                key={d.id}
                icone={FileText}
                titre={d.title}
                detail={lu.lieu}
                quand={lu.montant}
                gestes={
                  <>
                    <Link href={`/app/maintenance/${d.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
                      {t('devis.voir')}
                    </Link>
                    {l.refuses.has(`devis-${d.id}`) ? null : (
                      <Button size="sm" onClick={() => l.ouvrirDevis(d)}>
                        {t('devis.valider')}
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </GroupeAFaire>
      ) : null}

      {l.loyers.length > 0 ? (
        <GroupeAFaire titre={t('groupes.loyers')} compte={total(etats.loyers)} toutVoir={DESTINATIONS.loyers} pied={pied(etats.loyers, l.loyers.length, 'loyers', DESTINATIONS.loyers)}>
          {l.loyers.map((row) => (
            <RangeeAFaire
              key={`${row.source}-${row.id}`}
              icone={Wallet}
              ton="danger"
              titre={[row.payer?.name ?? t('loyers.sansLocataire'), row.property?.title ?? null].filter(Boolean).join(' · ')}
              detail={
                row.due_date
                  ? t('loyers.detail', { montant: f.montantCourt(row.amount_due ?? row.remaining_amount, row.currency ?? undefined), echeance: f.jourMois(row.due_date) })
                  : f.montantCourt(row.amount_due ?? row.remaining_amount, row.currency ?? undefined)
              }
              quand={row.days_late ? t('loyers.jours', { n: row.days_late }) : null}
              gestes={<LienTonal href={DESTINATIONS.loyer(row)} className={TONAL_RANGEE}>{t('voir')}</LienTonal>}
            />
          ))}
        </GroupeAFaire>
      ) : null}

      {l.hote && aUneLigne(l.hote.reservations) ? (
        <GroupeAFaire titre={t('groupes.reservations')} compte={l.hote.reservations.total} toutVoir={DESTINATIONS.reservations}>
          <RangeeAFaire
            icone={CalendarCheck}
            titre={t('reservations.carte', { n: l.hote.reservations.total })}
            detail={t('reservations.detail')}
            gestes={<LienTonal href={DESTINATIONS.reservations} className={TONAL_RANGEE}>{t('voir')}</LienTonal>}
          />
        </GroupeAFaire>
      ) : null}
      {l.hote && aUneLigne(l.hote.avis) ? (
        <GroupeAFaire titre={t('groupes.avis')} compte={l.hote.avis.total} toutVoir={DESTINATIONS.avis}>
          <RangeeAFaire
            icone={MessageSquareReply}
            titre={t('avis.carte', { n: l.hote.avis.total })}
            detail={t('avis.detail')}
            gestes={<LienTonal href={DESTINATIONS.avis} className={TONAL_RANGEE}>{t('avis.repondre')}</LienTonal>}
          />
        </GroupeAFaire>
      ) : null}
    </div>
  );
}
