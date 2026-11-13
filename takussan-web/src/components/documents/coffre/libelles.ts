'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { DossierVu, EntreeVue, EtiquetteDeDossier } from '@/lib/documents/coffre';

/**
 * TCK-2656 — les libellés du coffre, résolus depuis les CLÉS du module pur (`lib/documents/coffre`).
 *
 * Le français élide devant une voyelle (« Quittance d’octobre », « Relevé d’août 2026 ») : le mois
 * part avec un sélecteur `elision`, que l'anglais ignore.
 */
const VOYELLE = /^[aeiouyàâäéèêëîïôöûüh]/i;

export function useLibellesDuCoffre() {
  const t = useTranslations('documents.coffre');
  const tTypes = useTranslations('documents.types');
  const f = useFormatteurs();

  const avecMois = (date: string | null, annee: boolean) => {
    const mois = date ? f.date(date, annee ? { month: 'long', year: 'numeric' } : { month: 'long' }) : '';
    return { mois, elision: VOYELLE.test(mois) ? 'oui' : 'non' };
  };

  function dossier(etiquette: EtiquetteDeDossier): string {
    switch (etiquette.cle) {
      case 'bailDe':
        return t('dossiers.bailDe', { nom: etiquette.nom });
      case 'bien':
        return etiquette.nom;
      case 'quittances':
        return t('dossiers.quittances', { annee: String(etiquette.annee) });
      default:
        return t(`dossiers.${etiquette.cle}`);
    }
  }

  function entree(vue: EntreeVue): string {
    const e = vue.entree;
    switch (vue.nature) {
      case 'piece':
        return e.title || (e.category && tTypes.has(e.category) ? tTypes(e.category) : t('entrees.document'));
      case 'quittance':
      case 'charges':
        return t(`entrees.${vue.nature}`, avecMois(e.date, false));
      case 'releve':
        // Le titre est la période `AAAA-MM` ; la date, le dernier jour du mois.
        return t('entrees.releve', avecMois(e.title ? `${e.title}-01` : e.date, true));
      case 'attestation':
        return t('entrees.attestation', { annee: e.title ?? e.date?.slice(0, 4) ?? '' });
      case 'facture':
        return t('entrees.facture', { reference: e.title ?? '' });
      case 'autre':
        return t('entrees.document');
      default:
        return t(`entrees.${vue.nature}`);
    }
  }

  /** La ligne de détail : « 29 juin · PDF » pour un généré, « Pièce d’identité · ajout du 28 juin » pour une pièce. */
  function detail(vue: EntreeVue): string {
    const e = vue.entree;
    const date = e.date ? f.jourMois(e.date) : null;
    if (e.kind === 'generated') return date ? t('detail.genere', { date }) : 'PDF';
    const type = e.category && tTypes.has(e.category) ? tTypes(e.category) : null;
    // Le type n'est répété que s'il dit autre chose que le nom.
    if (type && date && type !== e.title) return t('detail.typeEtAjout', { type, date });
    return date ? t('detail.ajoute', { date }) : (type ?? '');
  }

  /** « nov. · oct. · sept. · caution » : le résumé d'un dossier replié (quittances, relevés). */
  function resume(d: DossierVu): string {
    const morceaux = d.entrees.slice(0, 6).map((vue) => {
      if (vue.nature === 'caution') return t('resume.caution');
      if (vue.nature === 'attestation') return vue.entree.title ?? vue.entree.date?.slice(0, 4) ?? entree(vue);
      if (vue.nature === 'releve' && vue.entree.title) return f.date(`${vue.entree.title}-01`, { month: 'short' });
      return vue.entree.date ? f.date(vue.entree.date, { month: 'short' }) : entree(vue);
    });
    return d.entrees.length > 6 ? `${morceaux.join(' · ')} · +${d.entrees.length - 6}` : morceaux.join(' · ');
  }

  return { dossier, entree, detail, resume };
}
