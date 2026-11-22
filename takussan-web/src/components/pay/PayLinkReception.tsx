'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, Download, Info, Landmark, Loader2, Lock, Phone, SearchX, Share2, Smartphone, TriangleAlert } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { BoutonCopier } from '@/components/lien-public/BoutonCopier';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { LienMort } from '@/components/lien-public/LienMort';
import { MAILTO_AIDE } from '@/components/lien-public/aide';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useFormatteurs, type Formatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone, telephonePublie } from '@/lib/phone';
import {
  downloadPayLinkReceipt,
  fetchPayLink,
  initiatePayLink,
  verifyPayLink,
  type PayLink,
  type PayLinkOfflinePayment,
  type PayLinkProvider,
} from '@/lib/queries/pay-link';
import { cn } from '@/lib/utils';

type Etat =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly link: PayLink }
  | { readonly kind: 'gone'; readonly agency: string | null }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error' };

/** Le retour du fournisseur, tel que le serveur l'a écrit dans l'URL de retour. */
export type RetourFournisseur = 'success' | 'cancelled' | null;

function etatDeLErreur(err: unknown): Etat | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 410) {
    const params = (err.data as { params?: { agency?: unknown } } | null)?.params;
    return { kind: 'gone', agency: typeof params?.agency === 'string' && params.agency !== '' ? params.agency : null };
  }
  if (err.status === 404) return { kind: 'notFound' };
  // Un jeton que `cheminApi` refuse (`/`, `?`, `#`, `..`) ne désigne aucun lien : aucun appel n'est
  // parti, et la page dit la même chose qu'à un jeton inconnu.
  if (err.status === 400 && (err.data as { code?: unknown } | null)?.code === 'invalid_path') return { kind: 'notFound' };
  return null;
}

interface PayLinkReceptionProps {
  readonly token: string;
  readonly retour?: RetourFournisseur;
}

/**
 * TCK-602 (ADR-0051 §1), refait par TCK-2505 (« Un total, un geste ») — la page `/pay/{jeton}` : un
 * locataire SANS COMPTE règle son échéance, dans la coque de lien nue (`CoqueDeLien`).
 *
 * ⚠ Les montants s'affichent TELS QUE L'API LES REND (AC35). `amount_due` est déjà le montant que
 * le fournisseur encaissera : il inclut la pénalité quand l'agence l'encaisse en ligne
 * (`late_fee_payable_online`), et ne l'inclut pas sinon. Additionner `late_fee_outstanding` ici
 * ferait afficher 165 000 pour un paiement de 157 500 — la page ne calcule donc rien, elle
 * DÉCOMPOSE au plus. Quand l'agence n'encaisse pas la pénalité en ligne, elle s'affiche sur sa
 * propre ligne « à régler auprès de votre agence, {agence} », hors du total (TCK-2505 AC2).
 *
 * Quatre états, aucun cul-de-sac : à payer ; hors ligne (le paiement en ligne est fermé : les moyens
 * que l'agence déclare, `offline_payment`, et son téléphone) ; réglée (avec la quittance pendant
 * trente jours) ; remboursée. Un lien mort a ses deux issues (`LienMort`).
 *
 * Le nom du locataire n'est PAS affiché : l'API ne le rend pas, et TCK-2504 interdit d'exposer
 * davantage de données du locataire sur ce lien au porteur.
 */
export function PayLinkReception({ token, retour = null }: PayLinkReceptionProps) {
  const t = useTranslations('lienPublic.paiement');
  const tCoque = useTranslations('lienPublic.coque');
  const [etat, setEtat] = useState<Etat>({ kind: 'loading' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let annule = false;
    // Au retour du fournisseur, l'état se relit chez lui d'abord : le webhook a pu se perdre.
    const verification = retour === 'success' ? verifyPayLink(token).catch(() => null) : Promise.resolve(null);
    verification
      .then(() => fetchPayLink(token))
      .then((link) => {
        if (!annule) setEtat({ kind: 'ready', link });
      })
      .catch((err: unknown) => {
        if (!annule) setEtat(etatDeLErreur(err) ?? { kind: 'error' });
      });
    return () => {
      annule = true;
    };
  }, [token, retour, tentative]);

  const mention = (
    <>
      <Lock className="size-3.5" aria-hidden="true" /> {t('securise')}
    </>
  );

  if (etat.kind === 'loading') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {tCoque('chargement')}
        </p>
      </>
    );
  }

  if (etat.kind === 'gone') {
    return (
      <>
        <EnTeteDeLien emetteur={etat.agency} mention={mention} />
        <LienMort data-testid="pay-gone" titre={t('perimeTitre')}>
          {etat.agency ? t('perimeTexteAgence', { agence: etat.agency }) : t('perimeTexte')}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <LienMort data-testid="pay-not-found" icone={<SearchX />} titre={t('introuvableTitre')}>
          {t('introuvableTexte')}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'error') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <div className="px-5 py-10">
          <ErrorState
            message={t('erreur')}
            onRetry={() => {
              setEtat({ kind: 'loading' });
              setTentative((n) => n + 1);
            }}
            retryLabel={tCoque('reessayer')}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <EnTeteDeLien emetteur={etat.link.agency.name} mention={mention} />
      <Echeance
        token={token}
        link={etat.link}
        retour={retour}
        surLienMort={(suivant) => setEtat(suivant)}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * L'échéance lue
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const VOYELLE_INITIALE = /^[aeiouyàâäéèêëîïôöûüh]/i;

/** Le titre de la page : la période de l'échéance (« Échéance d'octobre 2026 »). */
function titreDeLaPeriode(link: PayLink, f: Formatteurs, t: ReturnType<typeof useTranslations>): string {
  const { period_start: debut, period_end: fin } = link;
  if (debut && (!fin || debut.slice(0, 7) === fin.slice(0, 7))) {
    const mois = f.date(debut, { month: 'long', year: 'numeric' });
    return t('periodeMois', { mois, elision: VOYELLE_INITIALE.test(mois) ? 'oui' : 'non' });
  }
  if (debut && fin) return t('periodePlage', { debut: f.date(debut), fin: f.date(fin) });
  if (link.due_date) return t('periodeDate', { date: f.date(link.due_date) });
  return t('periodeInconnue');
}

function Echeance({
  token,
  link,
  retour,
  surLienMort,
}: {
  readonly token: string;
  readonly link: PayLink;
  readonly retour: RetourFournisseur;
  readonly surLienMort: (etat: Etat) => void;
}) {
  const t = useTranslations('lienPublic.paiement');
  const tCoque = useTranslations('lienPublic.coque');
  const f = useFormatteurs();
  const agence = link.agency.name ?? '';
  const montant = (valeur: number) => f.montant(valeur, link.currency ?? 'XOF');

  const titre = titreDeLaPeriode(link, f, t);
  const bien = [link.property.title, link.property.neighborhood].filter(Boolean).join(' · ');
  // Le titre de la période est le `<h1>` d'une échéance à payer ; sur une échéance réglée, c'est
  // l'état (« Cette échéance est réglée ») qui l'est, et la période passe en `<h2>`.
  const rienDu = link.amount_due <= 0 && link.late_fee_outstanding <= 0;
  const Titre = link.status === 'paid' || link.status === 'refunded' || rienDu ? 'h2' : 'h1';
  const objet = (
    <div>
      <Titre
        className={cn(
          'font-display font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground',
          Titre === 'h1' ? 'text-2xl' : 'text-lg',
        )}
      >
        {titre}
      </Titre>
      {bien ? <p className="mt-1 text-[0.9375rem] text-muted-foreground [overflow-wrap:anywhere]">{bien}</p> : null}
    </div>
  );
  const emisPar = agence ? (
    <p className="text-center text-[0.8125rem] text-muted-foreground">{tCoque('emisPar', { emetteur: agence })}</p>
  ) : null;

  if (link.status === 'refunded') {
    return (
      <div className="space-y-6 px-5 pb-8 pt-8" data-testid="pay-refunded">
        <Succes titre={t('rembourseeTitre')} />
        {objet}
        <EncartInfo>{t('rembourseeTexte', { agence })}</EncartInfo>
        <LienAide />
        {emisPar}
      </div>
    );
  }

  // TCK-2778 — un lien de la pénalité seule : son loyer est PAYÉ (`status: paid`), c'est la pénalité
  // qu'il fait payer. Lu AVANT la branche « réglée », qui dirait « Cette échéance est réglée ».
  if (link.subject === 'late_fee') {
    return (
      <PenaliteSeule token={token} link={link} retour={retour} surLienMort={surLienMort} titreDeLaPeriode={titre} bien={bien} emisPar={emisPar} />
    );
  }

  if (link.status === 'paid') {
    return (
      <div className="space-y-6 px-5 pb-8 pt-8" data-testid="pay-paid">
        <Succes titre={retour === 'success' ? t('merci') : t('reglee')}>
          {link.paid_at ? t('regleeLe', { date: f.date(link.paid_at) }) : t('regleeSansDate')}
        </Succes>
        {objet}
        <Quittance token={token} link={link} surLienMort={surLienMort} />
        {link.late_fee_outstanding > 0 ? (
          <PenaliteAPart montant={montant(link.late_fee_outstanding)} texte={t('penaliteResteTexte', { agence })} />
        ) : null}
        {link.offline_payment ? <MoyensHorsLigne moyens={link.offline_payment} titre={t('payerALAgence')} /> : null}
        {emisPar}
      </div>
    );
  }

  const enLigne = link.providers.length > 0 && link.amount_due > 0;
  // La pénalité est DANS `amount_due` seulement quand l'agence l'encaisse en ligne ET qu'il reste
  // quelque chose à payer ; sinon elle se règle à l'agence, à part.
  const penaliteIncluse = link.late_fee_payable_online && link.amount_due > 0 && link.late_fee_outstanding > 0;
  const penaliteAPart = !penaliteIncluse && link.late_fee_outstanding > 0;

  if (rienDu) {
    return (
      <div className="space-y-6 px-5 pb-8 pt-8" data-testid="pay-nothing-due">
        <Succes titre={t('rienAPayerTitre')} />
        {objet}
        <EncartInfo>{t('rienAPayerTexte', { agence })}</EncartInfo>
        <LienAide />
        {emisPar}
      </div>
    );
  }

  // Hors ligne, tout se règle à l'agence : la pénalité à part rejoint le total, qui reste UN montant.
  const penaliteDansLeTotal = penaliteIncluse || (!enLigne && penaliteAPart && link.amount_due > 0);
  const chiffres = totalEtDetail(
    penaliteAPart && penaliteDansLeTotal ? link.amount_due + link.late_fee_outstanding : link.amount_due,
    penaliteDansLeTotal ? link.late_fee_outstanding : 0,
  );
  const total =
    link.amount_due > 0 ? (
      <div>
        <p className="text-sm text-muted-foreground">{enLigne ? t('aPayer') : t('aReglerALAgence')}</p>
        <p
          className={cn(
            'font-display font-semibold tabular-nums tracking-[-0.03em] text-foreground',
            enLigne ? 'text-[2.75rem] leading-[1.05]' : 'text-[2rem] leading-tight',
          )}
          data-testid="pay-amount"
        >
          {montant(chiffres.total)}
        </p>
        {penaliteDansLeTotal ? (
          <p className="mt-1 text-[0.9375rem] tabular-nums text-muted-foreground" data-testid="pay-breakdown">
            {t('detailPenaliteIncluse', { base: montant(chiffres.base), penalite: montant(chiffres.penalite) })}
          </p>
        ) : null}
      </div>
    ) : null;

  const retard =
    link.status === 'late' && link.due_date ? (
      <p className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[0.8125rem] font-medium text-warning">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        {t('enRetard', { date: f.date(link.due_date) })}
      </p>
    ) : null;

  const penalite = penaliteAPart && !penaliteDansLeTotal ? (
    <PenaliteAPart
      montant={montant(link.late_fee_outstanding)}
      texte={link.amount_due > 0 ? t('penaliteAPartTexte', { agence }) : t('penaliteResteTexte', { agence })}
    />
  ) : null;

  const reference = link.reference ? <Reference valeur={link.reference} /> : null;

  if (enLigne) {
    return (
      <div className="space-y-6 px-5 pb-8 pt-6" data-testid="pay-link">
        {objet}
        {retour === 'cancelled' ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-foreground" role="status">
            {t('annule')}
          </p>
        ) : null}
        <div className="space-y-3">
          {total}
          {retard}
        </div>
        {penalite}
        <Fournisseurs token={token} providers={link.providers} surLienMort={surLienMort} />
        <SuiteDuPaiementEnLigne link={link} reference={reference} emisPar={emisPar} />
      </div>
    );
  }

  // Hors ligne : le paiement en ligne est fermé (aucun fournisseur), ou seule la pénalité reste due.
  const telephone = link.offline_payment?.agency_phone;
  return (
    <>
      <div className="space-y-6 px-5 pb-8 pt-6" data-testid="pay-unavailable">
        {objet}
        <div className="space-y-3">
          {total}
          {retard}
        </div>
        {penalite}
        {link.offline_payment ? (
          <>
            {link.amount_due > 0 ? <EncartInfo>{t('horsLigneOuvert', { agence })}</EncartInfo> : null}
            <MoyensHorsLigne moyens={link.offline_payment} />
            {reference ? (
              <div>
                <p className="text-[0.9375rem] text-foreground">{t('referenceMotif')}</p>
                <div className="mt-2">{reference}</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <EncartInfo>{t('horsLigneSansMoyen', { agence })}</EncartInfo>
            {reference}
            <LienAide />
          </>
        )}
        {emisPar}
      </div>
      {telephone ? (
        <BasDeLien>
          <a href={`tel:${telephonePublie(telephone)}`} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <Phone aria-hidden="true" />
            {t('appelerNumero', { numero: formaterTelephone(telephone) })}
          </a>
        </BasDeLien>
      ) : null}
    </>
  );
}

/**
 * Sous les boutons de paiement en ligne : « ou » payer directement à l'agence (ses moyens déclarés),
 * la référence, la validité du lien, l'émetteur. Commun à l'échéance et à la pénalité seule (TCK-2778).
 */
function SuiteDuPaiementEnLigne({
  link,
  reference,
  emisPar,
}: {
  readonly link: PayLink;
  readonly reference: ReactNode;
  readonly emisPar: ReactNode;
}) {
  const t = useTranslations('lienPublic.paiement');
  const f = useFormatteurs();
  return (
    <>
      {link.offline_payment ? (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" /> {t('ou')} <span className="h-px flex-1 bg-border" />
          </div>
          <MoyensHorsLigne moyens={link.offline_payment} titre={t('payerALAgence')} />
        </>
      ) : null}
      {reference}
      {link.expires_at ? (
        <p className="text-center text-[0.8125rem] text-muted-foreground">
          {t('valableJusquau', { date: f.date(link.expires_at) })}
        </p>
      ) : null}
      {emisPar}
    </>
  );
}

/**
 * TCK-2778 — la page d'un lien `subject: late_fee` : elle ne fait payer que la pénalité de retard d'une
 * échéance dont le loyer est déjà réglé, et le DIT (« Pénalité de retard », puis l'échéance). Le montant
 * est `amount_due` tel que l'API le rend (la pénalité seule), sans décomposition : il n'y a pas de loyer
 * à y additionner. Trois états : réglée (`late_fee_paid_at`, ou plus rien de dû), à payer en ligne (des
 * fournisseurs), à régler à l'agence (aucun fournisseur).
 */
function PenaliteSeule({
  token,
  link,
  retour,
  surLienMort,
  titreDeLaPeriode: periode,
  bien,
  emisPar,
}: {
  readonly token: string;
  readonly link: PayLink;
  readonly retour: RetourFournisseur;
  readonly surLienMort: (etat: Etat) => void;
  readonly titreDeLaPeriode: string;
  readonly bien: string;
  readonly emisPar: ReactNode;
}) {
  const t = useTranslations('lienPublic.paiement');
  const tPenalite = useTranslations('lienPublic.paiement.penaliteSeule');
  const f = useFormatteurs();
  const agence = link.agency.name ?? '';
  const montant = f.montant(Math.round(link.amount_due), link.currency ?? 'XOF');
  const reglee = Boolean(link.late_fee_paid_at) || link.amount_due <= 0;
  const objet = (Titre: 'h1' | 'h2') => (
    <div>
      <Titre
        className={cn(
          'font-display font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground',
          Titre === 'h1' ? 'text-2xl' : 'text-lg',
        )}
        data-testid="pay-late-fee-title"
      >
        {tPenalite('titre')}
      </Titre>
      <p className="mt-1 text-[0.9375rem] text-muted-foreground [overflow-wrap:anywhere]">{[periode, bien].filter(Boolean).join(' · ')}</p>
    </div>
  );

  if (reglee) {
    return (
      <div className="space-y-6 px-5 pb-8 pt-8" data-testid="pay-late-fee-paid">
        <Succes titre={retour === 'success' ? tPenalite('merci') : tPenalite('regleeTitre')}>
          {link.late_fee_paid_at ? tPenalite('regleeLe', { date: f.date(link.late_fee_paid_at) }) : tPenalite('regleeSansDate')}
        </Succes>
        {objet('h2')}
        {emisPar}
      </div>
    );
  }

  const enLigne = link.providers.length > 0;
  const reference = link.reference ? <Reference valeur={link.reference} /> : null;
  const total = (
    <div>
      <p className="text-sm text-muted-foreground">{enLigne ? tPenalite('aPayer') : tPenalite('aReglerALAgence')}</p>
      <p
        className={cn(
          'font-display font-semibold tabular-nums tracking-[-0.03em] text-foreground',
          enLigne ? 'text-[2.75rem] leading-[1.05]' : 'text-[2rem] leading-tight',
        )}
        data-testid="pay-amount"
      >
        {montant}
      </p>
    </div>
  );

  if (enLigne) {
    return (
      <div className="space-y-6 px-5 pb-8 pt-6" data-testid="pay-late-fee">
        {objet('h1')}
        {retour === 'cancelled' ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-foreground" role="status">
            {t('annule')}
          </p>
        ) : null}
        {total}
        <EncartInfo>{tPenalite('loyerRegle')}</EncartInfo>
        <Fournisseurs token={token} providers={link.providers} surLienMort={surLienMort} />
        <SuiteDuPaiementEnLigne link={link} reference={reference} emisPar={emisPar} />
      </div>
    );
  }

  const telephone = link.offline_payment?.agency_phone;
  return (
    <>
      <div className="space-y-6 px-5 pb-8 pt-6" data-testid="pay-late-fee-unavailable">
        {objet('h1')}
        {total}
        {link.offline_payment ? (
          <>
            <EncartInfo>{tPenalite('horsLigne', { agence })}</EncartInfo>
            <MoyensHorsLigne moyens={link.offline_payment} />
            {reference ? (
              <div>
                <p className="text-[0.9375rem] text-foreground">{t('referenceMotif')}</p>
                <div className="mt-2">{reference}</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <EncartInfo>{tPenalite('horsLigneSansMoyen', { agence })}</EncartInfo>
            {reference}
            <LienAide />
          </>
        )}
        {emisPar}
      </div>
      {telephone ? (
        <BasDeLien>
          <a href={`tel:${telephonePublie(telephone)}`} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <Phone aria-hidden="true" />
            {t('appelerNumero', { numero: formaterTelephone(telephone) })}
          </a>
        </BasDeLien>
      ) : null}
    </>
  );
}

/**
 * Le total et son détail, arrondis à l'unité (XOF n'a pas de sous-unité) de façon que le détail fasse TOUJOURS la
 * somme du total : la base est le total arrondi moins la pénalité arrondie, jamais l'arrondi de la base brute (une
 * pénalité en ,5 donnait « 151 111 + 7 556 » pour un total de 158 666).
 */
function totalEtDetail(totalBrut: number, penaliteBrute: number): { total: number; penalite: number; base: number } {
  const total = Math.round(totalBrut);
  const penalite = Math.round(penaliteBrute);
  return { total, penalite, base: total - penalite };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Pièces
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function Succes({ titre, children }: { readonly titre: string; readonly children?: ReactNode }) {
  return (
    <div>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-success/12 text-success" aria-hidden="true">
        <CircleCheck className="size-8" />
      </span>
      <h1 className="mt-4 font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground">
        {titre}
      </h1>
      {children ? <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function EncartInfo({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-secondary/60 p-4 text-[0.9375rem] text-foreground">
      <Info className="mt-0.5 size-5 flex-none text-primary-deep" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function LienAide() {
  const t = useTranslations('lienPublic.mort');
  return (
    <a href={MAILTO_AIDE} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
      {t('aide')}
    </a>
  );
}

function PenaliteAPart({ montant, texte }: { readonly montant: string; readonly texte: string }) {
  const t = useTranslations('lienPublic.paiement');
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4" data-testid="pay-late-fee-at-agency">
      <p className="text-[0.9375rem] font-semibold tabular-nums text-foreground">{t('penaliteAPartTitre', { montant })}</p>
      <p className="mt-1 text-sm text-muted-foreground">{texte}</p>
    </div>
  );
}

function Reference({ valeur }: { readonly valeur: string }) {
  const t = useTranslations('lienPublic.paiement');
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted py-1 pl-3.5 pr-1.5">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{t('reference')}</span>{' '}
        <span className="font-mono text-[0.9375rem] font-medium tracking-wide text-foreground [overflow-wrap:anywhere]">{valeur}</span>
      </p>
      <BoutonCopier valeur={valeur} quoi={t('reference')} avecLibelle />
    </div>
  );
}

/** Le numéro tel qu'on le TAPE dans Wave ou Orange Money : sans l'indicatif sénégalais. */
function aComposer(numero: string): string {
  return numero.replace(/^\+221/, '');
}

function MoyensHorsLigne({ moyens, titre }: { readonly moyens: PayLinkOfflinePayment; readonly titre?: string }) {
  const t = useTranslations('lienPublic.paiement');
  const lignes: { cle: string; nom: string; valeur: string; copie: string; icone: ReactNode; bloc?: boolean }[] = [];
  if (moyens.wave_number) {
    lignes.push({ cle: 'wave', nom: t('moyens.wave'), valeur: formaterTelephone(moyens.wave_number), copie: aComposer(moyens.wave_number), icone: <Smartphone className="size-5" /> });
  }
  if (moyens.orange_money_number) {
    lignes.push({
      cle: 'orange_money',
      nom: t('moyens.orangeMoney'),
      valeur: formaterTelephone(moyens.orange_money_number),
      copie: aComposer(moyens.orange_money_number),
      icone: <Smartphone className="size-5" />,
    });
  }
  if (moyens.bank_details) {
    lignes.push({ cle: 'bank', nom: t('moyens.virement'), valeur: moyens.bank_details, copie: moyens.bank_details, icone: <Landmark className="size-5" />, bloc: true });
  }
  const telephone = moyens.agency_phone;

  return (
    <div data-testid="pay-offline">
      {titre ? <p className="text-[0.9375rem] font-medium text-foreground">{titre}</p> : null}
      <ul className={cn('divide-y divide-border rounded-2xl border border-border bg-card', titre && 'mt-2.5')}>
        {lignes.map((m) => (
          <li key={m.cle} className="flex items-center gap-3 p-3.5">
            <IconeDeMoyen>{m.icone}</IconeDeMoyen>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] text-muted-foreground">{m.nom}</span>
              <span
                className={cn(
                  'block text-[0.9375rem] font-medium tabular-nums text-foreground [overflow-wrap:anywhere]',
                  m.bloc && 'whitespace-pre-line',
                )}
              >
                {m.valeur}
              </span>
            </span>
            <BoutonCopier valeur={m.copie} quoi={m.nom} />
          </li>
        ))}
        {telephone ? (
          <li className="flex items-center gap-3 p-3.5">
            <IconeDeMoyen>
              <Phone className="size-5" />
            </IconeDeMoyen>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] text-muted-foreground">{t('moyens.telephone')}</span>
              <span className="block text-[0.9375rem] font-medium tabular-nums text-foreground">{formaterTelephone(telephone)}</span>
            </span>
            <a
              href={`tel:${telephonePublie(telephone)}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 flex-none rounded-full')}
              aria-label={t('appelerNumero', { numero: formaterTelephone(telephone) })}
            >
              <Phone aria-hidden="true" />
              {t('appeler')}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function IconeDeMoyen({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-muted text-foreground" aria-hidden="true">
      {children}
    </span>
  );
}

function Fournisseurs({
  token,
  providers,
  surLienMort,
}: {
  readonly token: string;
  readonly providers: readonly PayLinkProvider[];
  readonly surLienMort: (etat: Etat) => void;
}) {
  const t = useTranslations('lienPublic.paiement');
  const tFournisseurs = useTranslations('payLink.providers');
  const [envoi, setEnvoi] = useState<PayLinkProvider | null>(null);
  const [erreur, setErreur] = useState(false);

  async function payer(provider: PayLinkProvider) {
    setEnvoi(provider);
    setErreur(false);
    try {
      const { checkout_url } = await initiatePayLink(token, provider);
      window.location.assign(checkout_url);
    } catch (err) {
      const nomme = etatDeLErreur(err);
      if (nomme) surLienMort(nomme);
      else setErreur(true);
      setEnvoi(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {erreur ? <ErrorState message={t('erreurPaiement')} /> : null}
      {providers.map((provider) => (
        <Button key={provider} size="lg" className="h-12 w-full text-[0.9375rem] font-semibold" onClick={() => void payer(provider)} disabled={envoi !== null}>
          {envoi === provider ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('payerAvec', { provider: tFournisseurs(provider) })}
        </Button>
      ))}
    </div>
  );
}

function Quittance({
  token,
  link,
  surLienMort,
}: {
  readonly token: string;
  readonly link: PayLink;
  readonly surLienMort: (etat: Etat) => void;
}) {
  const t = useTranslations('lienPublic.paiement');
  const f = useFormatteurs();
  const [enCours, setEnCours] = useState<'telecharger' | 'partager' | null>(null);
  const [erreur, setErreur] = useState(false);
  const agence = link.agency.name ?? '';
  const nomDuFichier = `${t('quittanceFichier')}-${link.reference ?? ''}.pdf`;

  async function lireLaQuittance(): Promise<Blob | null> {
    try {
      return await downloadPayLinkReceipt(token);
    } catch (err) {
      const nomme = etatDeLErreur(err);
      if (nomme) surLienMort(nomme);
      else setErreur(true);
      return null;
    }
  }

  async function telecharger() {
    setEnCours('telecharger');
    setErreur(false);
    const fichier = await lireLaQuittance();
    if (fichier) {
      const url = URL.createObjectURL(fichier);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nomDuFichier;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    }
    setEnCours(null);
  }

  /**
   * Partager la quittance là où le locataire la montrera (WhatsApp). Le FICHIER part par la feuille
   * de partage du téléphone — jamais l'URL du lien : son jeton est le droit de lire l'échéance.
   * Sans partage de fichier (bureau), un message WhatsApp sans lien dit le règlement.
   */
  async function partager() {
    setEnCours('partager');
    setErreur(false);
    const blob = await lireLaQuittance();
    if (blob) {
      const fichier = new File([blob], nomDuFichier, { type: 'application/pdf' });
      try {
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichier] })) {
          await navigator.share({ files: [fichier] });
        } else {
          const texte = t('partagerTexte', {
            reference: link.reference ?? '',
            date: link.paid_at ? f.date(link.paid_at) : '',
            agence,
          });
          window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // Partage abandonné par l'utilisateur : rien à dire.
      }
    }
    setEnCours(null);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-testid="pay-receipt">
      <dl className="space-y-2 text-[0.9375rem]">
        {link.paid_at ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('payeLe')}</dt>
            <dd className="tabular-nums text-foreground">{f.dateTime(link.paid_at)}</dd>
          </div>
        ) : null}
        {link.reference ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('reference')}</dt>
            <dd className="font-mono text-sm tracking-wide text-foreground [overflow-wrap:anywhere]">{link.reference}</dd>
          </div>
        ) : null}
      </dl>
      {erreur ? <ErrorState className="mt-4" message={t('quittanceErreur')} /> : null}
      {link.receipt_available ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button variant="outline" size="lg" onClick={() => void telecharger()} disabled={enCours !== null}>
            {enCours === 'telecharger' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            {t('quittance')}
          </Button>
          <Button variant="outline" size="lg" onClick={() => void partager()} disabled={enCours !== null}>
            {enCours === 'partager' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Share2 aria-hidden="true" />}
            {t('partager')}
          </Button>
        </div>
      ) : null}
      <p className="mt-3 text-[0.8125rem] text-muted-foreground">{t('quittanceDelai', { agence })}</p>
    </div>
  );
}
