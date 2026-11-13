'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Ban, Check, Clock, CloudOff, Link2Off, Loader2, Phone, Unlink, type LucideIcon } from 'lucide-react';

import { BoutonCollant } from '@/components/auth/BoutonCollant';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { useCurrentLocale } from '@/i18n/hooks';
import { ApiError } from '@/lib/api';
import type { InvitationFermee } from '@/lib/invitation-apercu';
import { demanderNouvelleInvitation } from '@/lib/invitation-code';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { BOUTON_D_INVITATION, LogoDeLAgence } from './PiecesDeLInvitation';

/**
 * TCK-2611 (ADR-0094 § 2, § 4) — un lien qui ne s'ouvre pas le dit TOUT DE SUITE, et donne l'issue :
 * expiré (« Demander une nouvelle invitation », le numéro de l'agence s'il est public), annulé
 * (« Appeler l'agence »), déjà accepté (« Me connecter »), inconnu ou incomplet (« Aller à l'accueil »).
 * Et un aperçu illisible (429, panne) propose de réessayer, sans rien affirmer de l'invitation.
 *
 * ⚠ **Aucun champ de saisie** (AC1) : rien à remplir pour un lien qui ne marche plus.
 *
 * Le 410 ne sert que l'agence (nom, logo, téléphone public) et la date : ni l'invitant ni le rôle — la
 * carte dit « Invitation du 3 nov. » là où la maquette nomme la personne.
 */
export type EtatDuLien = InvitationFermee['etat'] | 'inconnue' | 'incomplet' | 'indisponible';

const ICONES: Readonly<Record<EtatDuLien, LucideIcon>> = {
  expiree: Clock,
  annulee: Ban,
  acceptee: Check,
  inconnue: Link2Off,
  incomplet: Unlink,
  indisponible: CloudOff,
};

const LIEN_BOUTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-corps leading-normal font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** « 33 820 00 00 » : l'indicatif du Sénégal se tait. */
function telephoneAffiche(telephone: string): string {
  return formaterTelephone(telephone).replace(/^\+221 /, '');
}

export function EcranFerme({ etat, fermee = null, jeton = null }: { readonly etat: EtatDuLien; readonly fermee?: InvitationFermee | null; readonly jeton?: string | null }) {
  const t = useTranslations('invitationAccept.ferme');
  const format = useFormatter();
  const router = useRouter();
  const locale = useCurrentLocale();
  const decalage = useDecalageDuClavier();
  const [demande, setDemande] = useState<'pret' | 'envoi' | 'envoyee' | 'trop' | 'echec'>('pret');

  const Icone = ICONES[etat];
  const agence = fermee?.agence ?? null;
  const date = fermee?.inviteeLe ? format.dateTime(new Date(fermee.inviteeLe), { day: 'numeric', month: 'short' }) : null;
  const telephone = agence?.telephone ?? null;

  async function demander() {
    if (!jeton || demande === 'envoi' || demande === 'envoyee') return;
    setDemande('envoi');
    try {
      await demanderNouvelleInvitation(jeton, locale);
      setDemande('envoyee');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
        router.refresh();
        setDemande('pret');
        return;
      }
      setDemande(err instanceof ApiError && err.status === 429 ? 'trop' : 'echec');
    }
  }

  const texte =
    etat === 'expiree'
      ? agence && date
        ? // « le 3 nov. Les invitations… » : le point de l'abréviation tient lieu de point final (sans quoi « nov.. »).
          t('expiree.texte', { agence: agence.nom, date: date.replace(/\.$/, '') })
        : t('expiree.texteSans')
      : etat === 'annulee'
        ? agence
          ? t('annulee.texte', { agence: agence.nom })
          : t('annulee.texteSans')
        : etat === 'acceptee'
          ? agence
            ? t('acceptee.texte', { agence: agence.nom })
            : t('acceptee.texteSans')
          : t(`${etat}.texte`);

  const appeler = telephone ? (
    <p className="flex min-h-11 items-center justify-center gap-1.5 text-sm text-muted-foreground lg:min-h-0">
      {t('appeler')}
      <a href={`tel:${telephone}`} className="inline-flex items-center gap-1 rounded font-semibold tabular-nums text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
        <Phone className="size-3.5" aria-hidden="true" />
        {telephoneAffiche(telephone)}
      </a>
    </p>
  ) : null;

  let action: ReactNode;
  if (etat === 'expiree' && jeton) {
    action =
      demande === 'envoyee' ? (
        <p role="status" className="rounded-2xl bg-success/10 p-3.5 text-sm text-success text-pretty">
          {agence ? t('expiree.envoyee', { agence: agence.nom }) : t('expiree.envoyeeSans')}
        </p>
      ) : (
        <Button type="button" onClick={() => void demander()} disabled={demande === 'envoi'} className={BOUTON_D_INVITATION}>
          {demande === 'envoi' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('expiree.demander')}
        </Button>
      );
  } else if (etat === 'acceptee') {
    action = (
      <Link href="/auth/login" className={cn(LIEN_BOUTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
        {t('acceptee.action')}
      </Link>
    );
  } else if (etat === 'annulee' && telephone) {
    action = (
      <a href={`tel:${telephone}`} className={cn(LIEN_BOUTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
        <Phone className="size-4" aria-hidden="true" />
        {t('annulee.action')}
      </a>
    );
  } else if (etat === 'indisponible') {
    action = (
      <Button type="button" onClick={() => router.refresh()} className={BOUTON_D_INVITATION}>
        {t('indisponible.action')}
      </Button>
    );
  } else {
    action = (
      <Link href="/" className={cn(LIEN_BOUTON, 'border border-foreground/20 bg-card text-foreground hover:bg-muted')}>
        {t('accueil')}
      </Link>
    );
  }

  return (
    <div className="pt-3 lg:pt-0">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary-deep xl:size-16">
        <Icone className="size-7 xl:size-8" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="mt-5 font-display text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-balance xl:mt-6 xl:text-[2rem] xl:leading-[1.12] xl:tracking-[-0.025em]">
        {t(`${etat}.titre`)}
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-normal text-muted-foreground text-pretty xl:text-base">{texte}</p>

      {agence ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <LogoDeLAgence nom={agence.nom} logo={agence.logo} taille="s" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[0.9375rem] font-semibold">{agence.nom}</p>
            {date ? <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">{t('carte', { date })}</p> : null}
          </div>
        </div>
      ) : null}

      {etat === 'expiree' && jeton && demande !== 'envoyee' ? (
        // La maquette de bureau ne la dit pas : le bouton suit la carte.
        <p className="mt-3 text-[0.8125rem] leading-snug text-muted-foreground xl:hidden">{t('expiree.aide')}</p>
      ) : null}
      {demande === 'trop' || demande === 'echec' ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {demande === 'trop' ? t('expiree.trop') : t('expiree.echec')}
        </p>
      ) : null}

      {/* Aucun champ ici, donc jamais de clavier : le pied garde le retrait bas de la maquette (16 px). */}
      <BoutonCollant decalage={decalage} className="max-lg:mt-6 max-lg:pb-4 lg:mt-6">
        {action}
        {etat === 'expiree' ? <div className="mt-1 lg:mt-3">{appeler}</div> : null}
      </BoutonCollant>
      {etat === 'expiree' && appeler ? <div aria-hidden="true" className="h-11 flex-none lg:hidden" /> : null}
    </div>
  );
}
