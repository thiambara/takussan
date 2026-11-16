/**
 * TCK-2883 — « Visite confirmée » (maquette `app-visites` a-6) : la phrase suit les canaux REMIS au
 * visiteur (`notification` de `POST /api/property-visits`, TCK-2871), jamais un canal qui n'est pas parti.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { canauxRemis, SuccesDeLaPlanification, type VisitePlanifiee } from '../planification/PiecesDeLaPlanification';

const SMS = { queued_at: '2026-11-03T09:21:00Z', body: 'Votre visite est confirmée.' };

function visite(reponse: unknown, prenom: string | null = 'Mouhamed'): VisitePlanifiee {
  return {
    id: 8,
    jour: '2026-11-07',
    heure: '10:00',
    bien: { id: 10, libelle: 'Studio meublé' },
    visiteur: prenom ? `${prenom} Ndiaye` : null,
    prenom,
    telephone: '+221771112233',
    smsRetenu: false,
    ficheId: null,
    ficheCreee: false,
    canaux: canauxRemis(reponse),
  };
}

function phrase(v: VisitePlanifiee, depuisUneDemande = false): string | null | undefined {
  const { container, unmount } = render(withIntl(<SuccesDeLaPlanification visite={v} depuisUneDemande={depuisUneDemande} />));
  const texte = container.querySelector('[data-slot="phrase-des-canaux"]')?.textContent;
  unmount();
  return texte;
}

describe('TCK-2883 — la phrase des canaux de « Visite confirmée »', () => {
  it('AC4 — sms + mail : « Un SMS et un e-mail ont prévenu Mouhamed. »', () => {
    expect(phrase(visite({ notification: { channels: ['app', 'email', 'sms'], sms: SMS } }))).toBe(
      'Un SMS et un e-mail ont prévenu Mouhamed. La visite est dans votre agenda.',
    );
    expect(phrase(visite({ notification: { channels: ['email', 'sms'], sms: SMS } }), true)).toBe('Un SMS et un e-mail ont prévenu Mouhamed.');
  });

  it('sms seul : « Un SMS a prévenu Mouhamed. » — pas d’e-mail promis', () => {
    expect(phrase(visite({ notification: { channels: ['app', 'sms'], sms: SMS } }), true)).toBe('Un SMS a prévenu Mouhamed.');
  });

  it('`sms` absent de la remise (WhatsApp éligible) : WhatsApp, jamais « SMS »', () => {
    expect(phrase(visite({ notification: { channels: ['whatsapp', 'email'], sms: null } }), true)).toBe(
      'Un message WhatsApp et un e-mail ont prévenu Mouhamed.',
    );
  });

  it('`sms` nul alors que `channels` le nomme (retenu) : aucun SMS promis', () => {
    expect(phrase(visite({ notification: { channels: ['email', 'sms'], sms: null } }), true)).toBe('Un e-mail a prévenu Mouhamed.');
    expect(phrase(visite({ notification: { channels: ['app'], sms: null } }), true)).toBe(
      'Ni SMS ni e-mail n’est parti : prévenez Mouhamed par un autre moyen.',
    );
  });

  it('sans prénom : « le visiteur » ; sans `notification`, la phrase d’avant', () => {
    expect(phrase(visite({ notification: { channels: ['email', 'sms'], sms: SMS } }, null), true)).toBe('Un SMS et un e-mail ont prévenu le visiteur.');
    expect(phrase(visite({ data: { id: 8 } }), true)).toBe('Un SMS a prévenu Mouhamed.');
  });
});
