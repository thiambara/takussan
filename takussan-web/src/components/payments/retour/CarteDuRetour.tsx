'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleCheck, CircleHelp, CircleX, Hourglass, MessageSquare, RefreshCw, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref } from '@/components/crm/contact';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { Button, buttonVariants } from '@/components/ui/button';
import type { PaiementVerifie } from '@/hooks/useInitiatePayment';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import type { IssueDuRetour, LienDeRetour } from './issue-du-retour';

/**
 * TCK-2650 — la carte d'une issue du retour de passerelle (maquette `app-paiements`, écrans
 * « Retour — … »). Elle ne nomme que ce que le serveur a rendu : montant, période, fournisseur et
 * référence viennent de `verify` (`payment`), jamais de l'adresse — absents, la carte dit l'issue seule.
 */
const DISQUES: Record<IssueDuRetour, { readonly icone: ReactNode; readonly classe: string }> = {
  attente: { icone: <Hourglass className="size-7" strokeWidth={1.5} aria-hidden="true" />, classe: 'bg-warning/15 text-warning' },
  confirme: { icone: <CircleCheck className="size-7" strokeWidth={1.5} aria-hidden="true" />, classe: 'bg-success/15 text-success' },
  echec: { icone: <CircleX className="size-7" strokeWidth={1.5} aria-hidden="true" />, classe: 'bg-destructive/10 text-destructive' },
  rembourse: { icone: <RotateCcw className="size-7" strokeWidth={1.5} aria-hidden="true" />, classe: 'bg-muted text-accent' },
  invalide: { icone: <CircleHelp className="size-7" strokeWidth={1.5} aria-hidden="true" />, classe: 'bg-muted text-muted-foreground' },
};

/** Les variantes des liens-boutons, hors des `className` (la garde des classes émises lit leurs littéraux). */
const LIEN_PRINCIPAL = buttonVariants({ variant: 'default', size: 'lg' });
const LIEN_CONTOUR = buttonVariants({ variant: 'outline', size: 'lg' });
const LIEN_DISCRET = buttonVariants({ variant: 'ghost', size: 'lg' });

const TITRES = {
  attente: 'attente.titre',
  confirme: 'confirme.titre',
  echec: 'echec.titre',
  invalide: 'invalide.titre',
} as const;

/** Les fournisseurs nommés par `payments.gateway.picker.providers.*` : un code inconnu ne s'affiche pas. */
const FOURNISSEURS = ['wave', 'orange_money', 'lemon_squeezy'] as const;
type Fournisseur = (typeof FOURNISSEURS)[number];
const estFournisseur = (code: string | null | undefined): code is Fournisseur => (FOURNISSEURS as readonly string[]).includes(code ?? '');

export interface CarteDuRetourProps {
  readonly issue: IssueDuRetour;
  readonly lien: LienDeRetour | null;
  readonly paiement: PaiementVerifie | null;
  /** `status` serveur : distingue l'échéance annulée de celle déjà réglée, au remboursement. */
  readonly statutServeur: string | null;
  /** L'interrogation tourne encore (« Vérification automatique… »). */
  readonly interroge: boolean;
  /** L'attente a épuisé ses 2 minutes : « Vérifier à nouveau ». */
  readonly epuise: boolean;
  readonly onVerifierANouveau: () => void;
  readonly onReessayer: () => void;
  /** Le téléphone de l'agence (résumé du locataire), pour « Contacter l'agence ». */
  readonly telephoneDeLAgence: string | null;
}

export function CarteDuRetour({
  issue,
  lien,
  paiement,
  statutServeur,
  interroge,
  epuise,
  onVerifierANouveau,
  onReessayer,
  telephoneDeLAgence,
}: CarteDuRetourProps) {
  const t = useTranslations('payments.retour');
  const tPasserelle = useTranslations('payments.gateway');
  const f = useFormatteurs();
  const loyer = lien?.type === 'lease-payments';
  const fournisseur = estFournisseur(paiement?.provider) ? tPasserelle(`picker.providers.${paiement.provider}`) : null;
  // Le grand montant est celui que le fournisseur débite (`checkout_amount`), la ligne seule à défaut ;
  // l'écart entre les deux est la pénalité de retard encaissée avec elle. Sans `checkout_amount`, rien
  // n'est déduit.
  const debite = typeof paiement?.checkout_amount === 'number' ? paiement.checkout_amount : typeof paiement?.amount === 'number' ? paiement.amount : null;
  const montant = debite !== null ? f.montantCourt(debite, paiement?.currency) : null;
  const penalite =
    typeof paiement?.checkout_amount === 'number' && typeof paiement.amount === 'number' && paiement.checkout_amount > paiement.amount
      ? f.montantCourt(paiement.checkout_amount - paiement.amount, paiement.currency)
      : null;
  const annulee = (statutServeur ?? '').toLowerCase() === 'cancelled';

  const titre =
    issue === 'rembourse' ? t(annulee ? 'rembourse.titreAnnulee' : loyer ? 'rembourse.titreLoyer' : 'rembourse.titre') : t(TITRES[issue]);

  let texte: string;
  switch (issue) {
    case 'attente':
      texte = epuise
        ? t('attente.texteEpuise')
        : fournisseur && montant
          ? t('attente.texteNomme', { fournisseur, montant })
          : t('attente.texte');
      break;
    case 'confirme':
      texte = t(loyer && paiement?.lease_id ? 'confirme.texteQuittance' : 'confirme.texte');
      break;
    case 'echec':
      texte = fournisseur ? t('echec.texteNomme', { fournisseur }) : t('echec.texte');
      break;
    case 'rembourse':
      texte = t(annulee ? 'rembourse.texteAnnulee' : 'rembourse.texte');
      break;
    default:
      texte = t('invalide.texte');
  }

  const mois = loyer && paiement?.period_start ? f.date(paiement.period_start, { month: 'long', year: 'numeric', dateStyle: undefined }) : null;
  // « Loyer de décembre », mais « Loyer d'avril » : l'élision devant une voyelle (fr).
  const libelleDuMontant = mois ? t('detail.loyerDe', { mois, voyelle: /^[aeiouéèêh]/i.test(mois) ? 'oui' : 'non' }) : t('detail.montant');
  const statut =
    issue === 'attente'
      ? fournisseur
        ? t('detail.statut.attenteDe', { fournisseur })
        : t('detail.statut.attente')
      : issue === 'confirme'
        ? paiement?.paid_at
          ? t('detail.statut.payeLe', { date: f.jourMois(paiement.paid_at), heure: f.heure(paiement.paid_at) })
          : t('detail.statut.paye')
        : issue === 'echec'
          ? t('detail.statut.echec')
          : t('detail.statut.rembourse');

  const disque = DISQUES[issue];
  const lignes: { readonly cle: string; readonly libelle: string; readonly valeur: string; readonly fort?: boolean }[] = [];
  if (montant) lignes.push({ cle: 'montant', libelle: libelleDuMontant, valeur: montant, fort: true });
  if (montant && penalite) lignes.push({ cle: 'penalite', libelle: t('detail.dontPenalite'), valeur: penalite });
  if (fournisseur) lignes.push({ cle: 'moyen', libelle: t('detail.moyen'), valeur: fournisseur });
  if (paiement?.reference_number) lignes.push({ cle: 'reference', libelle: t('detail.reference'), valeur: paiement.reference_number });
  if (lignes.length > 0) lignes.push({ cle: 'statut', libelle: t('detail.statutLibelle'), valeur: statut });

  const quittance =
    issue === 'confirme' && loyer && lien && typeof paiement?.lease_id === 'number'
      ? { chemin: cheminApi`/api/leases/${paiement.lease_id}/receipts/${lien.id}/pdf`, nom: `quittance-${paiement.reference_number ?? lien.id}.pdf` }
      : null;
  const telephone = isReachable(telephoneDeLAgence) ? telephoneDeLAgence : null;
  const grand = 'h-11 w-full';

  return (
    <div className="flex flex-col items-center text-center" data-slot="carte-du-retour" data-issue={issue}>
      <span className={cn('inline-flex size-16 items-center justify-center rounded-full', disque.classe)}>{disque.icone}</span>
      <h1 className="mt-5 font-display text-affiche-22 font-semibold leading-tight tracking-titre text-foreground">{titre}</h1>
      <p className="mt-2 text-corps leading-snug text-muted-foreground">{texte}</p>

      {issue !== 'invalide' && lignes.length > 0 ? (
        <dl className="mt-6 w-full divide-y divide-border rounded-xl border border-border bg-card px-4 py-1.5 text-left" data-slot="detail-du-paiement">
          {lignes.map((l) => (
            <div key={l.cle} className={cn('flex items-baseline justify-between gap-4 py-2 text-sm', l.fort && 'text-corps font-semibold')}>
              <dt className={l.fort ? undefined : 'text-muted-foreground'}>{l.libelle}</dt>
              <dd className="flex-none text-right tabular-nums">{l.valeur}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {issue === 'attente' && interroge ? (
        <p className="mt-4 flex items-center gap-2 text-ui text-muted-foreground" role="status" aria-live="polite">
          <RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('attente.auto')}
        </p>
      ) : null}

      <div className="mt-6 w-full space-y-2.5">
        {quittance ? (
          <BoutonTelechargement chemin={quittance.chemin} nomFichier={quittance.nom} size="lg" className={grand}>
            {t('actions.telechargerQuittance')}
          </BoutonTelechargement>
        ) : null}
        {issue === 'echec' ? (
          <>
            <Button type="button" size="lg" className={grand} onClick={onReessayer}>
              {t('actions.reessayer')}
            </Button>
            {loyer ? (
              <Link href="/app/payments?moyen=agence" className={cn(LIEN_CONTOUR, grand)}>
                {t('actions.payerALAgence')}
              </Link>
            ) : null}
          </>
        ) : null}
        {issue === 'rembourse' && telephone ? (
          <a href={telHref(telephone)} className={cn(LIEN_CONTOUR, grand)}>
            <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('actions.contacterLAgence')}
          </a>
        ) : null}
        {issue === 'attente' && epuise ? (
          <Button type="button" size="lg" className={grand} onClick={onVerifierANouveau}>
            {t('actions.verifierANouveau')}
          </Button>
        ) : null}
        {issue === 'echec' ? null : (
          <Link
            href="/app/payments"
            className={cn(issue === 'invalide' ? LIEN_PRINCIPAL : issue === 'attente' ? LIEN_CONTOUR : LIEN_DISCRET, grand)}
          >
            {t(issue === 'invalide' ? 'actions.voirMesPaiements' : 'actions.retourAuxPaiements')}
          </Link>
        )}
      </div>
    </div>
  );
}
