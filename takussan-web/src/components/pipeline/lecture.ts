'use client';

import { useTranslations } from 'next-intl';

import { useLecteurDuClient } from '@/components/customer-dashboard/liste/pieces';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import type { CustomerListItem } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

/**
 * TCK-2592 — ce qu'une carte et une ligne du pipeline disent d'un prospect, déjà formulé (maquette
 * `app-pipeline` a) : la relance due et son retard, la prochaine action, le dernier contact, ce qu'il
 * cherche. La recherche reprend la lecture de la liste des clients (TCK-2590) : une seule rédaction.
 */
export interface LectureDuProspect {
  readonly nom: string;
  readonly prenom: string;
  readonly initiales: string;
  /** « Villa Almadies · offre 85 000 000 F » ; `null` si rien n'est renseigné (ou hors personnel). */
  readonly cherche: string | null;
  /** « Contacté il y a 9 j », sinon « Créé hier » (la fiche n'a jamais été contactée). */
  readonly dernier: string;
  /** La même date, pour « Dernier contact : il y a 9 j » (vue Étapes du téléphone). */
  readonly quand: string;
  /** Un contact est noté : sans lui, « Dernier contact : … » mentirait — on lit `dernier` (« Créé … »). */
  readonly contacte: boolean;
  /** La relance due, en rouge : « Sans contact depuis 9 j » ; `null` si rien n'est en retard. */
  readonly alerte: string | null;
  /** La prochaine action prévue (« Visite jeu. 12 nov. 10:00 », le titre d'une tâche) ; `null` sinon. */
  readonly prochaine: { readonly texte: string; readonly enRetard: boolean } | null;
  /** Ce qu'il y a à faire, en une ligne (téléphone, « À relancer »). */
  readonly quoi: string | null;
  /** Le retard en jours pleins (`follow_up.days`) ; `null` sans relance due. */
  readonly retard: number | null;
  /** Le compte rendu manque : le second geste devient « Compte rendu ». */
  readonly compteRendu: boolean;
}

const majuscule = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/** Le lecteur des cartes : une fonction pure par prospect, liée à la locale et à la minute courante. */
export function useLecteurDuProspect(maintenant: Date) {
  const t = useTranslations('crm.pipeline');
  const f = useFormatteurs();
  const lireClient = useLecteurDuClient(maintenant);

  const jour = (iso: string) => jourEnClair(jourADakar(new Date(iso)), f.locale);
  const ecart = (iso: string) => {
    const a = Date.parse(`${jourADakar(new Date(iso))}T12:00:00Z`);
    const b = Date.parse(`${jourADakar(maintenant)}T12:00:00Z`);
    return Math.max(0, Math.round((b - a) / 86_400_000));
  };
  const quand = (iso: string) => {
    const n = ecart(iso);
    return n === 0 ? t('quand.aujourdhui') : n === 1 ? t('quand.hier') : t('quand.jours', { n });
  };

  const prochaine = (c: PipelineCustomerCard): LectureDuProspect['prochaine'] => {
    const a = c.next_action;
    if (!a) return null;
    if (a.type === 'visit') {
      const heure = f.heure(a.at);
      const texte = jourADakar(new Date(a.at)) === jourADakar(maintenant) ? t('prochaine.visiteAujourdhui', { heure }) : t('prochaine.visite', { jour: jour(a.at), heure });
      return { texte, enRetard: a.overdue };
    }
    const titre = a.label?.trim();
    return { texte: titre ? majuscule(titre) : t('prochaine.tache', { jour: jour(a.at) }), enRetard: a.overdue };
  };

  return (c: PipelineCustomerCard): LectureDuProspect => {
    const client = lireClient({ ...c, email: null, status: 'active' } as CustomerListItem);
    const r = c.follow_up ?? null;
    const p = prochaine(c);
    const alerte = r
      ? r.reason === 'no_contact'
        ? t('alerte.no_contact', { days: r.days })
        : r.reason === 'report_missing'
          ? t('alerte.report_missing')
          : t('alerte.overdue_task', { days: r.days })
      : null;
    // Ce qu'il y a à faire : le compte rendu, sinon la tâche prévue (son titre), sinon reprendre contact.
    const quoi = r
      ? r.reason === 'report_missing'
        ? t('quoi.report_missing')
        : (p && c.next_action?.type === 'task' ? p.texte : null) ?? t(`quoi.${r.reason}`)
      : (p?.texte ?? null);
    const dernierContact = c.last_contacted_at ?? null;
    return {
      nom: client.nom,
      prenom: client.prenom,
      initiales: client.initiales,
      cherche: client.cherche ? [client.cherche.quoi, client.cherche.budget].filter(Boolean).join(' · ') || null : null,
      dernier: dernierContact ? t('dernier.contacte', { quand: quand(dernierContact) }) : t('dernier.cree', { quand: quand(c.created_at) }),
      quand: quand(dernierContact ?? c.created_at),
      contacte: dernierContact !== null,
      alerte,
      prochaine: p,
      quoi,
      retard: r ? r.days : null,
      compteRendu: r?.reason === 'report_missing',
    };
  };
}
