'use server';

import { getTranslations } from 'next-intl/server';

import { periodeDe } from '@/components/admin/finances/argent/encaissement';
import { isLocale, type Locale } from '@/i18n/config';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * TCK-2660 (ADR-0105 § 1) — le message prérempli d'une relance d'impayé, DANS LA LANGUE DU
 * LOCATAIRE, pas dans celle de l'écran : `payer.locale` de l'historique (son compte, sinon sa fiche,
 * TCK-2660 côté API), et la langue de l'écran quand elle est nulle ou inconnue.
 *
 * Une action serveur, parce que le navigateur ne tient que le dictionnaire de SA langue. Le texte
 * appartient au front (principe 5) et n'est jamais stocké : il part dans `wa.me`, modifiable.
 *
 * Il ne nomme aucun moyen de paiement : le lien de l'échéance ne dit pas lesquels il propose
 * (ticket : « il ne nomme un moyen de paiement que s'il est proposé sur le lien »).
 *
 * ⏸ Wolof en pause : les clés `wo` portent le texte français, un locataire `wo` reçoit le français.
 */
export interface EntreeDeRelance {
  /** La langue du locataire (`payer.locale`), ou rien. */
  readonly localeDuLocataire: string | null | undefined;
  /** La langue de l'écran : le repli. */
  readonly localeDeLEcran: string;
  readonly prenom: string | null | undefined;
  readonly paymentType: string | null;
  readonly periodStart: string | null | undefined;
  readonly dueDate: string | null | undefined;
  readonly montant: number;
  readonly devise: string | null | undefined;
  readonly bien: string | null | undefined;
  readonly lien: string;
}

const AUCUN = 'aucun';
/** Un champ libre ne dépasse pas cette longueur dans le message (titre de bien, prénom). */
const LONGUEUR_MAX = 160;

function court(valeur: string | null | undefined): string {
  const propre = (valeur ?? '').trim().slice(0, LONGUEUR_MAX);
  return propre === '' ? AUCUN : propre;
}

export async function composerLaRelanceAction(entree: EntreeDeRelance): Promise<{ readonly locale: Locale; readonly texte: string }> {
  const locale: Locale = isLocale(entree.localeDuLocataire)
    ? entree.localeDuLocataire
    : isLocale(entree.localeDeLEcran)
      ? entree.localeDeLEcran
      : 'fr';
  const t = await getTranslations({ locale, namespace: 'admin.finances.impayes.message' });
  const tPeriode = await getTranslations({ locale, namespace: 'admin.finances.argent.periode' });

  const montant = formatCurrency(entree.montant, locale, { currency: entree.devise ?? 'XOF' });
  const echeance = entree.dueDate ? `${entree.dueDate.slice(0, 10)}T12:00:00Z` : null;
  const memeAnnee = echeance ? echeance.slice(0, 4) === new Date().toISOString().slice(0, 4) : true;
  const date = echeance
    ? formatDate(echeance, locale, { dateStyle: undefined, day: 'numeric', month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }) })
    : '';
  const commun = { prenom: court(entree.prenom), montant, bien: court(entree.bien), date, lien: entree.lien.slice(0, 500) };

  const { cle, mois } = periodeDe({ source: 'lease', payment_type: entree.paymentType, period_start: entree.periodStart ?? null, due_date: entree.dueDate ?? null });
  if (entree.paymentType === 'rent' && mois) {
    const nomDuMois = formatDate(`${mois.slice(0, 7)}-15T12:00:00Z`, locale, { dateStyle: undefined, month: 'long' });
    return {
      locale,
      texte: t('loyer', { ...commun, mois: nomDuMois, voyelle: /^[aeiouyàâéèêh]/i.test(nomDuMois) ? 'oui' : 'non' }),
    };
  }
  const nomDuMois = mois ? formatDate(`${mois.slice(0, 7)}-15T12:00:00Z`, locale, { dateStyle: undefined, month: 'long' }) : '';
  const libelle = tPeriode(cle, { mois: nomDuMois, voyelle: /^[aeiouyàâéèêh]/i.test(nomDuMois) ? 'oui' : 'non' });
  return { locale, texte: t('autre', { ...commun, libelle }) };
}
