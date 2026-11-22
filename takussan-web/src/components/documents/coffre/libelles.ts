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
      case 'bailDuLocataire':
        return t('dossiers.bailDuLocataire', { nom: etiquette.nom });
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
    // TCK-2898 — « Devis et rapports » se résume par ses comptes : « 1 devis · 12 rapports de fin d’intervention ».
    if (d.kind === 'quotes_reports') {
      const devis = d.entrees.filter((v) => v.nature === 'devis').length;
      const rapports = d.entrees.filter((v) => v.nature === 'rapport').length;
      return [devis > 0 ? t('resume.devis', { count: devis }) : null, rapports > 0 ? t('resume.rapports', { count: rapports }) : null]
        .filter(Boolean)
        .join(' · ');
    }
    // TCK-2898 — les factures refacturées au bailleur (« Relevés et factures ») se résument par leur
    // compte, en fin : un mois seul ne les distinguerait pas d'un relevé.
    const factures = d.entrees.filter((v) => v.nature === 'facture').length;
    const entrees = d.kind === 'statements' ? d.entrees.filter((v) => v.nature !== 'facture') : d.entrees;
    if (d.kind === 'statements' && factures > 0) {
      const debut = entrees.length > 0 ? resume({ ...d, entrees }) : null;
      return [debut, t('resume.factures', { count: factures })].filter(Boolean).join(' · ');
    }
    const morceaux = entrees.slice(0, 6).map((vue) => {
      if (vue.nature === 'caution') return t('resume.caution');
      if (vue.nature === 'attestation') return vue.entree.title ?? vue.entree.date?.slice(0, 4) ?? entree(vue);
      if (vue.nature === 'releve' && vue.entree.title) return f.date(`${vue.entree.title}-01`, { month: 'short' });
      return vue.entree.date ? f.date(vue.entree.date, { month: 'short' }) : entree(vue);
    });
    return d.entrees.length > 6 ? `${morceaux.join(' · ')} · +${d.entrees.length - 6}` : morceaux.join(' · ');
  }

  /**
   * TCK-2898 — la ligne de détail d'un sous-dossier de bail (maquette `COFFRE_BAILLEUR` : « Contrat, état
   * des lieux · 2 documents ») : ce qu'il contient, par nature, puis son compte.
   */
  function resumeDuSousDossier(d: DossierVu): string {
    const natures = [...new Set(d.entrees.map((v) => (v.nature === 'edlEntree' || v.nature === 'edlSortie' ? 'edl' : v.nature)))];
    const morceaux = natures.map((n) => (n === 'contrat' || n === 'edl' || n === 'piece' ? t(`resume.${n}`) : null)).filter((m): m is string => m !== null);
    const compte = t('resume.documents', { count: d.entrees.length });
    if (morceaux.length === 0) return compte;
    const liste = morceaux.join(', ');
    return `${liste.charAt(0).toLocaleUpperCase()}${liste.slice(1)} · ${compte}`;
  }

  return { dossier, entree, detail, resume, resumeDuSousDossier };
}
