'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, CalendarClock, ShieldCheck, Star, UserPlus, Wallet } from 'lucide-react';

import { ErreurDeBloc, SqueletteDeCarte, ToutEstAJour } from '@/components/accueil/EtatsDeBloc';
import { ACTION_DANGER, CarteAFaire, CarteFile, GroupeAFaire, LienTonal, RangeeAFaire, TitreBloc, TitreColonne } from '@/components/accueil/pieces';
import { AttribuerDialog } from '@/components/leads/boite/AttribuerDialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { anciennete, aUneLigne, totalDe, tranchesNonVides, type Anciennete } from '@/lib/accueil/a-faire';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ContactLead } from '@/lib/queries/contact-leads';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import type { PaymentHistoryRow } from '@/types/invoice';
import { cn } from '@/lib/utils';

import { FeuilleDuBien } from './FeuilleDuBien';
import { useLectureDeLEcheance } from './lecture-de-l-echeance';
import { LigneDeVisite } from './LigneDeVisite';
import { useFilesDeLAdmin, type FilesDeLAdmin } from './useFilesDeLAdmin';

/**
 * TCK-2624 (ADR-0096, maquette `app-accueil` a, écran « Admin d'agence ») — « À faire maintenant » de
 * l'admin d'agence : ce qui attend SA décision, avec son geste.
 *
 *  - **Téléphone** : une carte par file — la tête de file « 1 bien à valider » (Voir / Valider), puis
 *    les files entières, chacune avec son verbe (Attribuer, Voir, Modérer, Relancer).
 *  - **Bureau** : des groupes de rangées denses (« À valider », « Demandes non attribuées »,
 *    « Visites à confirmer », « Impayés »), chacune avec son geste, « Voir les N autres » en pied.
 *
 * Les gestes restent sur l'accueil : valider (feuille du bas, panneau au bureau — décision du porteur
 * du 2026-11-11 sur `FeuilleDuBas`), attribuer (le dialogue de la boîte des demandes), confirmer
 * (l'heure fixée, ou une heure libre de la tranche — le geste de la liste des visites). Au succès, la
 * famille de la file est relue : la ligne quitte la liste ET la pastille de la colonne baisse (même cache).
 *
 * TCK-2775 (décision du porteur du 2026-11-14, n° 16 b) — « Relancer » MÈNE à l'écran Impayés, qui
 * ouvre la relance depuis son adresse (`relance-de-l-adresse.ts`) : la file guidée pour « Relancer
 * tout », la relance de l'échéance pour sa rangée. L'accueil ne charge plus ni le code ni les libellés
 * de la relance (`admin`, `lease`). L'échéance d'exemple est toujours de bail (`useFilesDeLAdmin`).
 *
 * Un geste que l'API refuse (403) devient « Voir » : la ligne mène à l'objet.
 */

const DESTINATIONS = {
  bien: (id: number) => `/app/agency/moderation/properties?selected=${id}`,
  demandes: '/app/leads?filtre=unassigned',
  demande: (id: number) => `/app/leads?filtre=unassigned&ouverte=${id}`,
  visites: '/app/visits?vue=to_confirm',
  avis: '/app/agency/moderation?filter[moderation_status]=pending',
  kyc: '/app/agency/kyc',
  invitations: '/app/agency/team?vue=invitations',
  impayes: '/app/agency/finances?tab=impayes',
  /** TCK-2775 — la file guidée de l'écran Impayés, dans l'ordre de son « Relancer tout ». */
  relancerTout: '/app/agency/finances?tab=impayes&relance=file',
  /** TCK-2775 — la relance d'une échéance ; `bail` la retrouve au-delà des 100 plus en retard. */
  relancer: (row: PaymentHistoryRow) => `/app/agency/finances?tab=impayes&relance=${row.id}${row.lease_id ? `&bail=${row.lease_id}` : ''}`,
} as const;

/** « il y a 2 h », « depuis hier », « 3 jours » : l'âge d'une attente, sous trois tournures. */
function useAge() {
  const t = useTranslations('accueil.aFaire');
  const maintenant = useMinuteCourante();
  const dire = (forme: 'ilYa' | 'depuis' | 'duree', a: Anciennete) => t(`${forme}.${a.unite}`, { n: a.unite === 'hier' ? 1 : a.n });
  return (forme: 'ilYa' | 'depuis' | 'duree', iso: string | null | undefined) => (iso ? dire(forme, anciennete(iso, maintenant)) : null);
}

export function AFaireAdmin({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('accueil.admin');
  const tBlocs = useTranslations('accueil.blocs');
  const files = useFilesDeLAdmin(agencyId);

  const [bienOuvert, setBienOuvert] = useState<ModerationProperty | null>(null);
  const [aAttribuer, setAAttribuer] = useState<ContactLead | null>(null);
  // Les objets dont l'API a refusé le geste (403) : leur ligne mène à l'objet, sans geste.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set());
  const refuser = (cle: string) => setRefuses((avant) => new Set(avant).add(cle));

  const gestes: GestesDeLAdmin = {
    refuses,
    refuser,
    valider: setBienOuvert,
    attribuer: setAAttribuer,
  };

  let corps: ReactNode;
  if (files.bloc === 'chargement') {
    corps = (
      <ul className="space-y-3 max-md:px-4" aria-busy="true">
        <SqueletteDeCarte />
        <SqueletteDeCarte />
      </ul>
    );
  } else if (files.bloc === 'echec') {
    corps = <ErreurDeBloc quoi={tBlocs('quoi.aFaire')} onReessayer={files.reessayer} className="max-md:mx-4" />;
  } else if (files.bloc === 'aJour') {
    corps = <ToutEstAJour texte={t('toutEstAJour')} className="max-md:mx-4" />;
  } else {
    corps = (
      <>
        <CartesDuTelephone files={files} gestes={gestes} />
        <GroupesDuBureau files={files} gestes={gestes} />
        {files.enEchec ? <ErreurDeBloc quoi={tBlocs('quoi.uneFile')} onReessayer={files.reessayer} className="mt-3 max-md:mx-4" /> : null}
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

      {bienOuvert ? (
        <FeuilleDuBien
          bien={bienOuvert}
          onFermer={() => setBienOuvert(null)}
          onRefuse={() => {
            refuser(`bien-${bienOuvert.id}`);
            setBienOuvert(null);
          }}
        />
      ) : null}
      {aAttribuer ? <AttribuerDialog leadId={aAttribuer.id} agencyId={aAttribuer.agency_id ?? agencyId} onClose={() => setAAttribuer(null)} /> : null}
    </section>
  );
}

interface GestesDeLAdmin {
  readonly refuses: ReadonlySet<string>;
  readonly refuser: (cle: string) => void;
  readonly valider: (bien: ModerationProperty) => void;
  readonly attribuer: (demande: ContactLead) => void;
}

/** « Bien proposé par Oumy Samb · 350 000 F » : qui propose, et le prix demandé. */
function useLectureDuBien() {
  const t = useTranslations('accueil.admin.bien');
  const f = useFormatteurs();
  return (b: ModerationProperty) => {
    const prix = f.montantCourt(b.price, b.currency ?? 'XOF');
    return {
      court: b.owner?.name ? t('parQui', { bien: b.title, proprietaire: b.owner.name }) : b.title,
      long: b.owner?.name ? t('propose', { proprietaire: b.owner.name, prix }) : prix,
    };
  };
}

/** « Moussa Diallo » · « Villa 4 chambres à Ngor · « Est-elle toujours disponible ? » » */
function useLectureDeLaDemande() {
  const t = useTranslations('accueil.admin.demandes');
  return (d: ContactLead) => {
    const message = d.message?.trim();
    const bien = d.property?.title?.trim();
    return {
      nom: d.name?.trim() || d.email?.trim() || t('sansNom'),
      detail: [bien, message ? `« ${message} »` : null].filter(Boolean).join(' · ') || t('sansMessage'),
    };
  };
}

/* ───────────────────────────────────────────── Téléphone ───────────────────────────────────────────── */

function CartesDuTelephone({ files, gestes }: { readonly files: FilesDeLAdmin; readonly gestes: GestesDeLAdmin }) {
  const t = useTranslations('accueil.admin');
  const f = useFormatteurs();
  const age = useAge();
  const lireBien = useLectureDuBien();
  const { etats } = files;
  const bien = files.bien?.data[0] ?? null;
  const demande = files.demandes?.data[0] ?? null;
  const visite = files.visites?.data[0] ?? null;
  return (
    <ul data-slot="a-faire-telephone" className="space-y-3 px-4 md:hidden">
      {aUneLigne(etats.bien) && bien ? (
        <CarteAFaire
          icone={ShieldCheck}
          vignette={bien.main_photo_url}
          titre={t('bien.carte', { n: etats.bien.total })}
          quand={age('depuis', bien.submitted_at)}
          detail={lireBien(bien).court}
          secondaire={
            <Link href={DESTINATIONS.bien(bien.id)} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              {t('voir')}
            </Link>
          }
          primaire={
            gestes.refuses.has(`bien-${bien.id}`) ? null : (
              <Button size="lg" className="font-semibold" onClick={() => gestes.valider(bien)}>
                {t('bien.valider')}
              </Button>
            )
          }
        />
      ) : null}
      {aUneLigne(etats.demandes) && demande ? (
        <CarteFile
          icone={UserPlus}
          titre={t('demandes.carte', { n: etats.demandes.total })}
          detail={t('demandes.plusAncienne', { quand: age('ilYa', demande.created_at) ?? '' })}
          action={
            <Button variant="secondary" size="lg" className="flex-none px-3.5 font-semibold" onClick={() => gestes.attribuer(demande)}>
              {t('demandes.attribuer')}
            </Button>
          }
        />
      ) : null}
      {aUneLigne(etats.visites) ? (
        <CarteFile
          icone={CalendarClock}
          titre={t('visites.carte', { n: etats.visites.total })}
          detail={visite?.scheduled_at ? t('visites.laPlusProche', { quand: f.date(visite.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' }) }) : ''}
          action={<LienTonal href={DESTINATIONS.visites} className="flex-none">{t('voir')}</LienTonal>}
        />
      ) : null}
      {aUneLigne(etats.avis) ? (
        <CarteFile
          icone={Star}
          titre={t('avis.carte', { n: etats.avis.total })}
          detail={t('avis.plusAncien', { duree: age('duree', files.avis?.data[0]?.created_at) ?? '' })}
          action={<LienTonal href={DESTINATIONS.avis} className="flex-none">{t('avis.moderer')}</LienTonal>}
        />
      ) : null}
      {aUneLigne(etats.kyc) && files.kyc ? (
        <CarteFile
          icone={ShieldCheck}
          titre={t('kyc.titre')}
          detail={t(`kyc.statut.${files.kyc === 'rejected' ? 'rejected' : 'pending'}`)}
          action={<LienTonal href={DESTINATIONS.kyc} className="flex-none">{t('kyc.completer')}</LienTonal>}
        />
      ) : null}
      {aUneLigne(etats.invitations) ? (
        <CarteFile
          icone={Building2}
          titre={t('invitations.carte', { n: etats.invitations.total })}
          detail={t('invitations.detail')}
          action={<LienTonal href={DESTINATIONS.invitations} className="flex-none">{t('voir')}</LienTonal>}
        />
      ) : null}
      {aUneLigne(etats.impayes) && files.impayes ? (
        <CarteFile
          danger
          icone={Wallet}
          titre={t('impayes.carte', { n: etats.impayes.total })}
          detail={f.montantCourt(files.impayes.total.amount, 'XOF')}
          action={
            <Link href={DESTINATIONS.relancerTout} className={cn(buttonVariants({ variant: 'outline' }), ACTION_DANGER)}>
              {t('impayes.relancer')}
            </Link>
          }
        />
      ) : null}
    </ul>
  );
}

/* ───────────────────────────────────────────── Bureau ───────────────────────────────────────────── */

/** Le bouton tonal d'une rangée (h-8, 13 px) ; le plein est réservé à la tête de file. */
const TONAL_RANGEE = 'h-8 px-3 text-ui font-semibold';

function GroupesDuBureau({ files, gestes }: { readonly files: FilesDeLAdmin; readonly gestes: GestesDeLAdmin }) {
  const t = useTranslations('accueil.admin');
  const tTranches = useTranslations('accueil.admin.impayes.tranches');
  const f = useFormatteurs();
  const age = useAge();
  const lireBien = useLectureDuBien();
  const lireDemande = useLectureDeLaDemande();
  const lireImpaye = useLectureDeLEcheance();
  const { etats } = files;
  const bien = files.bien?.data[0] ?? null;
  const avecBien = aUneLigne(etats.bien) && bien !== null;
  const avecAvis = aUneLigne(etats.avis);
  const avecKyc = aUneLigne(etats.kyc) && files.kyc !== null;
  const avecInvitations = aUneLigne(etats.invitations);
  const demandes = aUneLigne(etats.demandes) ? (files.demandes?.data ?? []) : [];
  const visites = aUneLigne(etats.visites) ? (files.visites?.data ?? []) : [];
  const impayes = aUneLigne(etats.impayes) ? files.impayes : null;
  const echeance = files.echeance;
  const autres = (total: number, montrees: number) => Math.max(0, total - montrees);

  return (
    <div data-slot="a-faire-bureau" className="space-y-5 max-md:hidden">
      {avecBien || avecAvis ? (
        <GroupeAFaire titre={t('groupes.aValider')} compte={(avecBien ? totalDe(etats.bien) : 0) + (avecAvis ? totalDe(etats.avis) : 0)}>
          {avecBien && bien ? (
            <RangeeAFaire
              icone={ShieldCheck}
              vignette={bien.main_photo_url}
              titre={bien.title}
              detail={lireBien(bien).long}
              quand={age('depuis', bien.submitted_at)}
              gestes={
                <>
                  <Link href={DESTINATIONS.bien(bien.id)} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
                    {t('voir')}
                  </Link>
                  {gestes.refuses.has(`bien-${bien.id}`) ? null : (
                    <Button size="sm" onClick={() => gestes.valider(bien)}>
                      {t('bien.valider')}
                    </Button>
                  )}
                </>
              }
            />
          ) : null}
          {avecAvis ? (
            <RangeeAFaire
              icone={Star}
              titre={t('avis.carte', { n: totalDe(etats.avis) })}
              detail={t('avis.attendDepuis', { duree: age('duree', files.avis?.data[0]?.created_at) ?? '' })}
              gestes={<LienTonal href={DESTINATIONS.avis} className={TONAL_RANGEE}>{t('avis.moderer')}</LienTonal>}
            />
          ) : null}
        </GroupeAFaire>
      ) : null}

      {demandes.length > 0 ? (
        <GroupeAFaire
          titre={t('groupes.demandes')}
          compte={etats.demandes.etat === 'pret' ? etats.demandes.total : undefined}
          toutVoir={DESTINATIONS.demandes}
          pied={
            etats.demandes.etat === 'pret' && autres(etats.demandes.total, demandes.length) > 0
              ? { texte: t('demandes.autres', { n: autres(etats.demandes.total, demandes.length) }), href: DESTINATIONS.demandes }
              : null
          }
        >
          {demandes.map((d) => {
            const l = lireDemande(d);
            return (
              <RangeeAFaire
                key={d.id}
                icone={UserPlus}
                titre={l.nom}
                detail={l.detail}
                quand={age('ilYa', d.created_at)}
                gestes={
                  <>
                    <Link href={DESTINATIONS.demande(d.id)} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
                      {t('voir')}
                    </Link>
                    <Button variant="secondary" className={TONAL_RANGEE} onClick={() => gestes.attribuer(d)}>
                      {t('demandes.attribuer')}
                    </Button>
                  </>
                }
              />
            );
          })}
        </GroupeAFaire>
      ) : null}

      {visites.length > 0 ? (
        <GroupeAFaire
          titre={t('groupes.visites')}
          compte={etats.visites.etat === 'pret' ? etats.visites.total : undefined}
          toutVoir={DESTINATIONS.visites}
          pied={
            etats.visites.etat === 'pret' && autres(etats.visites.total, visites.length) > 0
              ? { texte: t('visites.autres', { n: autres(etats.visites.total, visites.length) }), href: DESTINATIONS.visites }
              : null
          }
        >
          {visites.map((v) => (
            <LigneDeVisite key={v.id} v={v} refusee={gestes.refuses.has(`visite-${v.id}`)} onRefus={() => gestes.refuser(`visite-${v.id}`)} />
          ))}
        </GroupeAFaire>
      ) : null}

      {avecKyc || avecInvitations ? (
        <GroupeAFaire titre={t('groupes.agence')}>
          {avecKyc && files.kyc ? (
            <RangeeAFaire
              icone={ShieldCheck}
              titre={t('kyc.titre')}
              detail={t(`kyc.statut.${files.kyc === 'rejected' ? 'rejected' : 'pending'}`)}
              gestes={<LienTonal href={DESTINATIONS.kyc} className={TONAL_RANGEE}>{t('kyc.completer')}</LienTonal>}
            />
          ) : null}
          {avecInvitations ? (
            <RangeeAFaire
              icone={Building2}
              titre={t('invitations.carte', { n: totalDe(etats.invitations) })}
              detail={t('invitations.detail')}
              gestes={<LienTonal href={DESTINATIONS.invitations} className={TONAL_RANGEE}>{t('voir')}</LienTonal>}
            />
          ) : null}
        </GroupeAFaire>
      ) : null}

      {impayes ? (
        <GroupeAFaire
          titre={t('groupes.impayes')}
          compte={impayes.total.count}
          toutVoir={DESTINATIONS.impayes}
          pied={echeance && impayes.total.count > 1 ? { texte: t('impayes.autres', { n: impayes.total.count - 1 }), href: DESTINATIONS.impayes } : null}
        >
          <RangeeAFaire
            danger
            icone={Wallet}
            titre={t('impayes.total', { n: impayes.total.count, montant: f.montantCourt(impayes.total.amount, 'XOF') })}
            detail={tranchesNonVides(impayes)
              .map((tr) => tTranches(tr.cle, { n: tr.n }))
              .join(' · ')}
            gestes={
              <Link
                href={DESTINATIONS.relancerTout}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-bord-danger bg-card text-destructive hover:bg-destructive/6 hover:text-destructive')}
              >
                {t('impayes.relancerTout')}
              </Link>
            }
          />
          {echeance ? (
            <RangeeAFaire
              icone={Wallet}
              ton="neutre"
              titre={[lireImpaye.nom(echeance), echeance.property?.title?.trim()].filter(Boolean).join(' · ')}
              detail={`${lireImpaye.montantDu(echeance)} · ${lireImpaye.periode(echeance)}`}
              quand={t('impayes.jours', { n: echeance.days_late ?? 0 })}
              gestes={
                <>
                  <Link href={DESTINATIONS.impayes} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
                    {t('voir')}
                  </Link>
                  <Link href={DESTINATIONS.relancer(echeance)} className={cn(buttonVariants({ variant: 'secondary' }), TONAL_RANGEE)}>
                    {t('impayes.relancerUn')}
                  </Link>
                </>
              }
            />
          ) : null}
        </GroupeAFaire>
      ) : null}
    </div>
  );
}
