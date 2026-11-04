import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { RadarMessageSegment, RadarOutreach } from '@/types/radar';
import { ApercuMessage } from '../ApercuMessage';
import { LIEN_CONDITIONS, message } from './mocks';

/**
 * TCK-2471 — un message `accord.v4` porte la phrase de la demande dans son texte fixe ; l'aperçu de la console dit pourquoi
 * elle y est : les cibles de la demande qui couvrent ses annonces (« Recherché : … »). Sans cible, rien.
 */
const PHRASE = 'Des personnes recherchent en ce moment sur Takussan un bien comme le vôtre.';

const SEGMENTS_V4: readonly RadarMessageSegment[] = [
  { kind: 'fixed', text: 'Takussan — ' },
  { kind: 'salutation', text: 'Bonjour Awa,' },
  { kind: 'fixed', text: '\n\nNous avons vu ' },
  { kind: 'resume', text: 'votre F3 aux Almadies' },
  { kind: 'fixed', text: ` et nous aimerions publier gratuitement votre ou vos annonces.\n\n${PHRASE}\n\n1. … Conditions : ${LIEN_CONDITIONS}` },
];

function rendre(partiel: Partial<RadarOutreach>) {
  render(withIntl(
    <ApercuMessage
      message={message(partiel)}
      erreurIa={null}
      desactive={false}
      enRetouche={false}
      enEnvoi={false}
      onRetoucher={vi.fn()}
      onEnvoye={vi.fn()}
      apiDisponible={false}
      reponseEnAttente={false}
      enEnvoiApi={false}
      onEnvoyerApi={vi.fn()}
    />,
  ));
}

describe('ApercuMessage — la phrase de la demande (TCK-2471)', () => {
  it('montre la phrase dans le texte et sa raison : le nom des cibles de la demande', () => {
    rendre({
      clauses_version: 'accord.v4',
      segments: SEGMENTS_V4,
      message: SEGMENTS_V4.map((s) => s.text).join(''),
      demand_targets: ['Appartement aux Almadies', 'Studio à Ouakam'],
    });

    expect(screen.getByTestId('radar-message-segments')).toHaveTextContent(PHRASE);
    const raison = screen.getByTestId('radar-message-demande');
    expect(raison).toHaveTextContent('Ce message dit à l’annonceur que des personnes recherchent un bien comme le sien sur Takussan.');
    expect(raison).toHaveTextContent('Recherché : Appartement aux Almadies, Studio à Ouakam');
  });

  it('sans cible de la demande, aucune raison ne s’affiche', () => {
    rendre({ demand_targets: [] });

    expect(screen.queryByTestId('radar-message-demande')).not.toBeInTheDocument();
  });
});
