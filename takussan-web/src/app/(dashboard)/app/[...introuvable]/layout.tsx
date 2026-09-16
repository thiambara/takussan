import { notFound } from 'next/navigation';

/**
 * Attrape-tout de `/app` — il n'existe que pour appeler `notFound()`.
 *
 * Mesuré le 2026-09-16 (revue design, groupe A) : `../not-found.tsx` n'est servi par Next que sur
 * un APPEL à `notFound()`. Une URL qui ne correspond à AUCUNE route (`/app/nexiste-pas`, une faute
 * de frappe) ne l'appelle jamais : Next remontait au `not-found.tsx` RACINE, celui du site public,
 * hors de la coque — sans barre latérale, avec « Voir les annonces » pour seule sortie. C'est
 * l'éjection que TCK-382 supprimait, revenue par un autre chemin.
 *
 * Un segment statique l'emporte toujours sur un attrape-tout : ce segment ne capte que ce que rien
 * d'autre ne sert. L'appel vit dans le LAYOUT et non dans la page, pour la raison de TCK-442
 * (`../leases/[id]/layout.tsx`) : c'est la seule place où il rend 404 quel que soit le repli.
 */
export default function Layout(): never {
  notFound();
}
