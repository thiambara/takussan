'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { AdminAgencyUserRow } from '@/types/admin-users';

import { etatDuMembre, presenceDe } from './etat-de-l-equipe';

/**
 * TCK-2667 — les pièces partagées par la ligne, le tableau et la fiche d'un membre (maquette
 * `app-equipe`, a : `DeuxFA`, `PuceEtat`, la puce « Vous »).
 */

/** La double authentification : verte posée, orange à activer (« 2FA » au téléphone). */
export function DeuxFacteurs({ active, court = false }: { readonly active: boolean; readonly court?: boolean }) {
  const t = useTranslations('admin.team.equipe.deuxFA');
  return active ? (
    <span className="inline-flex items-center gap-1 text-success">
      <ShieldCheck className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {court ? t('court') : t('activee')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-medium text-warning">
      <ShieldAlert className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {court ? t('courtAActiver') : t('aActiver')}
    </span>
  );
}

export function PuceVous() {
  const t = useTranslations('admin.team.equipe');
  return <span className="flex-none rounded-full bg-muted px-1.5 py-px text-legende font-medium text-encre-douce">{t('vous')}</span>;
}

/** « En ligne hier » — la dernière connexion dite comme une présence. */
export function TextePresence({ derniereConnexion }: { readonly derniereConnexion: string | null }) {
  const t = useTranslations('admin.team.equipe.presence');
  const { jourMois } = useFormatteurs();
  const p = presenceDe(derniereConnexion);
  switch (p.forme) {
    case 'jamais':
      return <>{t('jamais')}</>;
    case 'aujourdhui':
      return <>{t('aujourdhui')}</>;
    case 'hier':
      return <>{t('hier')}</>;
    case 'ilYa':
      return <>{t('ilYa', { n: p.jours })}</>;
    case 'le':
      return <>{t('le', { date: jourMois(p.date) })}</>;
  }
}

/** « hier, 18:42 » — la dernière connexion du tableau et de la fiche. */
export function TexteConnexion({ derniereConnexion }: { readonly derniereConnexion: string | null }) {
  const t = useTranslations('admin.team.equipe.connexion');
  const { jourMois, heure } = useFormatteurs();
  const p = presenceDe(derniereConnexion);
  if (p.forme === 'jamais' || !derniereConnexion) return <>{t('jamais')}</>;
  if (p.forme === 'aujourdhui') return <>{t('aujourdhui', { heure: heure(derniereConnexion) })}</>;
  if (p.forme === 'hier') return <>{t('hier', { heure: heure(derniereConnexion) })}</>;
  return <>{jourMois(derniereConnexion)}</>;
}

/** La pastille d'état : actif (succès), absent jusqu'au… (attention), suspendu (danger). */
export function PuceDEtat({ membre, agencyId }: { readonly membre: AdminAgencyUserRow; readonly agencyId: number }) {
  const t = useTranslations('admin.team.equipe.etat');
  const tCompte = useTranslations('admin.users');
  const { jourMois } = useFormatteurs();
  const etat = etatDuMembre(membre, agencyId);
  if (etat === 'suspendu') return <StatusBadge tone="danger" label={t('suspendu')} />;
  if (etat === 'absent' && membre.current_absence) {
    return <StatusBadge tone="attention" label={t('absent', { date: jourMois(membre.current_absence.ends_at) })} />;
  }
  // TCK-1834 — un COMPTE non actif (bloqué par la plateforme, inactif) se dit tel quel : la pastille
  // de l'agence ne le masque pas. Un statut que le dictionnaire ne nomme pas reste brut.
  if (membre.status !== 'active') {
    const libelle = tCompte.has(`status.${membre.status}`) ? tCompte(`status.${membre.status}`) : membre.status;
    return <StatusBadge tone={membre.status === 'blocked' ? 'danger' : 'neutral'} label={libelle} />;
  }
  return <StatusBadge tone="success" label={t('actif')} />;
}
