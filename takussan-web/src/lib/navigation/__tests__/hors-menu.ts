/**
 * TCK-2477 (ADR-0089 §1) — les pages de `/app` qui n'ont PAS d'entrée de menu, et pourquoi.
 *
 * Clé : le motif de route tel que `MOTIFS_DE_ROUTE` le calcule (groupes `(…)` retirés). Une page
 * neuve sans entrée ni ligne ici fait rougir `arborescence.test.ts`.
 */
export const HORS_MENU: Readonly<Record<string, string>> = {
  '/app/[...introuvable]': 'Attrape-tout des URL inconnues : rend l’« introuvable » du tableau de bord.',
  '/app/account/privacy': 'Atteinte depuis le profil (confidentialité, effacement du compte).',
  '/app/crm': 'Redirection permanente vers /app/customers (TCK-042), gardée pour les anciens favoris.',
  '/app/crm/pipeline': 'Atteinte depuis la liste des clients (le tableau du pipeline, TCK-083).',
  '/app/notifications': 'Atteinte par la cloche de la barre haute.',
  '/app/profile': 'Atteinte par la carte du compte, en pied de barre latérale.',
  '/app/profile/notifications': 'Atteinte depuis le profil (préférences de notification).',
  '/app/settings/agency/upgrade': 'Atteinte par la carte « Passer en pro » (TCK-267).',
};
