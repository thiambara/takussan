import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

/**
 * TCK-2584 — la fenêtre de bienvenue de l'agent ne parle plus de « leads » ni de « pipeline » : la
 * première diapositive présente la boîte des demandes (`/app/leads`, « Demandes » dans le menu).
 *
 * Le wolof est en pause depuis le 2026-10-16 : sur décision de session, sa diapositive porte le
 * nouveau texte français tel quel (titre et corps), comme une clé neuve — l'ancien parlait de pipeline.
 */
describe('AgentWelcomeWizard — vocabulaire de la diapositive des demandes', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s : ni « leads » ni « pipeline »', (_langue, messages) => {
    const { title, body } = messages.agentWelcome.slides.leads;
    expect(`${title} ${body}`).not.toMatch(/pipeline|\bleads?\b/i);
  });

  it('fr : le titre dit « Vos demandes »', () => {
    expect(fr.agentWelcome.slides.leads.title).toBe('Vos demandes');
  });

  it('wo : le texte français tel quel (pause du wolof)', () => {
    expect(wo.agentWelcome.slides.leads).toEqual(fr.agentWelcome.slides.leads);
  });
});
