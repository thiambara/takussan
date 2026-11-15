'use client';

import { useTranslations } from 'next-intl';

import {
  alerteDuDossier,
  resumeDuBien,
  type BailDuCoffre,
  type BienDuCoffre,
  type ComptesDuCoffre,
  type DossierDAgence,
} from '@/lib/documents/coffre-de-l-agence';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-2896 — les libellés du coffre de l'agence, résolus depuis les clés du module pur
 * (`lib/documents/coffre-de-l-agence`) sous `documents.agence.*`.
 */
export function useLibellesDeLAgence(nomDeLAgence: string | null) {
  const t = useTranslations('documents.agence');
  const f = useFormatteurs();

  const documents = (n: number) => t('compte.documents', { n });

  /** « 1 expire dans 42 jours · 1 à vérifier », « 2 expirent bientôt », ou `null`. */
  function alerte(c: ComptesDuCoffre, aujourdhui: string): string | null {
    const a = alerteDuDossier(c, aujourdhui);
    if (a === null) return null;
    const morceaux: string[] = [];
    if (a.expire) {
      morceaux.push(
        a.expire.n === 1 && a.expire.jours !== null
          ? a.expire.jours === 0
            ? t('alerte.uneExpireAujourdhui')
            : t('alerte.uneExpireDans', { jours: a.expire.jours })
          : t('alerte.expirent', { n: a.expire.n }),
      );
    }
    if (a.aVerifier > 0) morceaux.push(t('alerte.aVerifier', { n: a.aVerifier }));
    return morceaux.join(' · ');
  }

  function dossier(d: Pick<DossierDAgence, 'key'>): string {
    if (d.key === 'agency_pieces') return nomDeLAgence ?? t('dossiers.agency_pieces');
    return t(`dossiers.${d.key}`);
  }

  function bail(b: BailDuCoffre): string {
    return t('bailDe', { nom: b.tenant.name ?? b.reference_number ?? `#${b.id}` });
  }

  function detailDuBail(b: BailDuCoffre): string | null {
    if (b.reference_number && b.start_date) return t('bailDetail', { reference: b.reference_number, date: f.date(b.start_date) });
    return b.reference_number ?? (b.start_date ? f.date(b.start_date) : null);
  }

  function detailDuBien(b: BienDuCoffre): string {
    return b.neighborhood ? t('bienDetail', { quartier: b.neighborhood, documents: documents(b.documents) }) : documents(b.documents);
  }

  function resume(b: BienDuCoffre): string {
    const r = resumeDuBien(b);
    if (r.cle === 'unBail') return t('resume.unBail', { locataire: r.locataire, documents: documents(r.documents) });
    if (r.cle === 'baux') return t('resume.baux', { n: r.baux, documents: documents(r.documents) });
    return documents(r.documents);
  }

  function sousTitre(c: ComptesDuCoffre): string {
    const morceaux = [documents(c.documents)];
    if (c.expiring_soon > 0) morceaux.push(t('compte.expirent', { n: c.expiring_soon }));
    if (c.unverified > 0) morceaux.push(t('compte.aVerifier', { n: c.unverified }));
    return morceaux.join(' · ');
  }

  return { documents, alerte, dossier, bail, detailDuBail, detailDuBien, resume, sousTitre, nomDeLAgence: nomDeLAgence ?? t('dossiers.agency_pieces') };
}

export type LibellesDeLAgence = ReturnType<typeof useLibellesDeLAgence>;
