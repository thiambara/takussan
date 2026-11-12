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
  '/app/profile/contact': 'Rubrique du sommaire du profil, TCK-2635 (coordonnées : téléphone, courriel).',
  '/app/profile/delete-account': 'Rubrique du sommaire du profil, TCK-2635 (suppression du compte).',
  '/app/profile/directory': 'Rubrique du sommaire du profil, TCK-2635 (annuaire public du bailleur, où il ne paraît que s’il le choisit).',
  '/app/profile/language': 'Rubrique du sommaire du profil, TCK-2635 (langue de l’interface).',
  '/app/profile/menu': 'Rubrique du sommaire du profil, TCK-2635 (menu et affichage : menu par défaut, barre latérale de cet appareil).',
  '/app/profile/notifications': 'Atteinte depuis le profil (préférences de notification).',
  '/app/profile/payouts': 'Rubrique du sommaire du profil, TCK-2635 (moyens de versement).',
  '/app/profile/professional': 'Rubrique du sommaire du profil, TCK-2635 (profil de prestataire).',
  '/app/profile/public-profile': 'Rubrique du sommaire du profil, TCK-2635 (profil public).',
  '/app/profile/search-preferences': 'Rubrique du sommaire du profil, TCK-2635 (préférences de recherche).',
  '/app/profile/security': 'Rubrique du sommaire du profil, TCK-2635 (mot de passe, double authentification, sessions).',
  '/app/profile/spaces': 'Rubrique du sommaire du profil, TCK-2635 (mes espaces).',
  '/app/profile/timezone': 'Rubrique du sommaire du profil, TCK-2635 (fuseau horaire).',
  '/app/settings/agency/upgrade': 'Atteinte par la carte « Passer en pro » (TCK-267).',
};
