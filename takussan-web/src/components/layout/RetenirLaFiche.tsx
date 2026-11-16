'use client';

import { useEffect } from 'react';
import { useContexteDuMenuDeLaCoque } from './contexte-du-menu-de-la-coque';
import { oublierPage, retenirFiche, type TypeDeFiche } from '@/lib/navigation/pages-recentes';

interface RetenirLaFicheProps {
  readonly type: TypeDeFiche;
  readonly id: number | string;
  /** Le nom que la fiche affiche (titre du bien, nom du client…) ; vide ou `null` : rien n'est retenu. */
  readonly titre: string | null | undefined;
  /** Le chemin qui rouvre la fiche (`/app/properties/42`, `/app/leads?ouverte=12`). */
  readonly chemin: string;
}

/**
 * TCK-2846 — « cette fiche a été ouverte » : une fiche de `/app` le monte, et elle entre dans les
 * récents de l'espace actif sous son nom et son type (« Villa 4 chambres à Ngor · Bien »). Lit le compte
 * et l'espace dans le contexte de la coque : hors de la coque (tests, autre surface), rien. Ne rend rien.
 *
 * Ne retient que le chemin, le type, l'identifiant et le titre — un titre qui ressemble à un téléphone ou
 * à un courriel est refusé (`retenirFiche`).
 */
export function RetenirLaFiche({ type, id, titre, chemin }: RetenirLaFicheProps) {
  const contexte = useContexteDuMenuDeLaCoque();
  const compte = contexte?.user.id ?? null;
  const espace = contexte?.espaceActif ?? null;
  useEffect(() => {
    if (compte !== null) retenirFiche(compte, espace, { type, id, titre, chemin });
  }, [compte, espace, type, id, titre, chemin]);
  return null;
}

/**
 * TCK-2846 — une fiche refusée (le panneau « accès refusé » d'un bien ou d'un client) sort des récents,
 * sans rien afficher de plus. L'introuvable (404) est oublié par la page introuvable elle-même.
 */
export function OublierLaFiche({ chemin }: { readonly chemin: string }) {
  const contexte = useContexteDuMenuDeLaCoque();
  const compte = contexte?.user.id ?? null;
  const espace = contexte?.espaceActif ?? null;
  useEffect(() => {
    if (compte !== null) oublierPage(compte, espace, chemin);
  }, [compte, espace, chemin]);
  return null;
}
