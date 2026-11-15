'use client';

import { useTranslations } from 'next-intl';

import type { AuteurServi, RoleDAuteur } from '@/types/document';

const ROLES: readonly RoleDAuteur[] = ['platform', 'agency', 'landlord', 'tenant', 'customer'];

/**
 * TCK-2773 (ADR-0099, amendement du 2026-11-13) — ce que la fiche écrit de l'auteur que l'API a jugé
 * pour le lecteur (`*_person`) : le nom tel qu'il est servi, sinon le rôle traduit (« l’agence »,
 * « Takussan », « votre bailleur »…), sinon rien. Le front ne déduit jamais un nom d'un identifiant.
 *
 * `debut` : le rôle en tête de ligne (« L’agence · 28 juin »), sinon au fil de la phrase.
 */
export function useNomDAuteur(): (personne: AuteurServi | null | undefined, debut?: boolean) => string | null {
  const t = useTranslations('documents.fiche.auteurs');
  return (personne, debut = false) => {
    if (!personne) return null;
    if (personne.name) return personne.name;
    const role = personne.role;
    if (role === null || !ROLES.includes(role)) return null;
    return debut ? t(`roleSeul.${role}`) : t(`role.${role}`);
  };
}
