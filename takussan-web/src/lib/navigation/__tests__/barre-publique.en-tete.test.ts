import { describe, expect, it } from 'vitest';

import { enTeteAuTelephone, estPageDeLien, type EnTeteAuTelephone } from '../barre-publique';

/**
 * TCK-2568 (amendement d'ADR-0091 du 2026-11-09) — ce qui tient le haut de l'écran au téléphone,
 * route par route. La table est RECOPIÉE du relevé des maquettes
 * (`docs/qa/audit-ux-2026-11/entetes-mobiles.md`) : elle ne se dérive pas de la règle qu'elle juge.
 */
const ATTENDU: ReadonlyArray<readonly [string, EnTeteAuTelephone]> = [
  // La barre du site : l'accueil, les pages légales, la sélection partagée, l'inconnu (404).
  ['/fr', 'barre-du-site'],
  ['/en', 'barre-du-site'],
  ['/fr/legal/terms', 'barre-du-site'],
  ['/fr/legal/privacy', 'barre-du-site'],
  ['/fr/legal/notice', 'barre-du-site'],
  ['/fr/favorites/shared', 'barre-du-site'],
  ['/fr/une-page-inconnue', 'barre-du-site'],
  // La liste : « ← [la recherche en vigueur] ».
  ['/fr/properties', 'retour-et-recherche'],
  ['/wo/properties', 'retour-et-recherche'],
  // Leur propre en-tête.
  ['/fr/properties/appartement-3-chambres-mermoz', 'en-tete-de-page'],
  ['/fr/properties/appartement-3-chambres-mermoz/photos', 'en-tete-de-page'],
  ['/fr/favorites', 'en-tete-de-page'],
  ['/fr/compare', 'en-tete-de-page'],
  ['/fr/bookings', 'en-tete-de-page'],
  ['/fr/account', 'en-tete-de-page'],
  // L'annuaire (grand titre « Professionnels ») et les fiches d'agence (boutons sur la couverture) et
  // d'agent (« ← · partager ») — vague 3, TCK-2521 → TCK-2523. Leurs 404 et leurs pannes posent la
  // barre de marque eux-mêmes (`auTelephone="marque"`).
  ['/fr/agencies', 'en-tete-de-page'],
  ['/fr/agencies/dakar-immo', 'en-tete-de-page'],
  ['/en/agents', 'en-tete-de-page'],
  ['/fr/agents/sokhna-gueye', 'en-tete-de-page'],
  // Les pages par lien : la coque nue.
  ['/fr/pay/jeton', 'en-tete-de-page'],
  ['/fr/claim/jeton', 'en-tete-de-page'],
  ['/fr/share/jeton', 'en-tete-de-page'],
  ['/fr/search-alerts/confirm', 'en-tete-de-page'],
  ['/fr/search-alerts/unsubscribe', 'en-tete-de-page'],
  ['/fr/notifications/unsubscribe', 'en-tete-de-page'],
];

describe('enTeteAuTelephone — le haut de l’écran au téléphone, route par route (TCK-2568)', () => {
  it.each(ATTENDU)('%s → %s', (chemin, attendu) => {
    expect(enTeteAuTelephone(chemin)).toBe(attendu);
  });

  it('suit le chemin, jamais la requête ni un segment voisin au nom proche', () => {
    expect(enTeteAuTelephone('/fr/properties?contract_type=rent')).toBe('retour-et-recherche');
    expect(enTeteAuTelephone('/fr/propertiesx')).toBe('barre-du-site');
    expect(enTeteAuTelephone('/fr/accounts')).toBe('barre-du-site');
  });

  it('hors du site public (aucun préfixe de langue) : la barre, comme avant', () => {
    expect(enTeteAuTelephone('/app')).toBe('barre-du-site');
    expect(enTeteAuTelephone(null)).toBe('barre-du-site');
  });

  it('une page par lien n’a jamais la barre du site — la même liste que la coque (estPageDeLien)', () => {
    for (const [chemin] of ATTENDU) {
      if (estPageDeLien(chemin)) expect(enTeteAuTelephone(chemin), chemin).toBe('en-tete-de-page');
    }
  });

  it('la règle ne rend jamais la barre de marque : c’est une surcharge que la page pose', () => {
    for (const [chemin] of ATTENDU) expect(enTeteAuTelephone(chemin), chemin).not.toBe('marque');
  });
});
