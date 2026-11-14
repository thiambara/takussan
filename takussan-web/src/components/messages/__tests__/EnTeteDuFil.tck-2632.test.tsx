/**
 * TCK-2632 — l'en-tête du fil « la personne d'abord » : le nom de la personne, le bien en lien ; appel
 * et WhatsApp SEULEMENT quand le contexte rend un téléphone joignable (AC6 : un client n'en voit
 * jamais) ; chaque geste consigné sur la fiche du client (délai de première réponse) ; « ⋯ » porte
 * les infos d'un groupe et la sourdine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { EnTeteDuFil } from '../EnTeteDuFil';

let contexte: unknown;
let compact = false;
const consigner = vi.fn();
/** Les envois jamais rendus par l'espion : rendus après chaque test, pour qu'aucun verrou du registre (par client) ne survive. */
const suspens = vi.hoisted(() => [] as (() => void)[]);
const gesteEnCours = vi.hoisted(() => ({ valeur: false }));
const sourdine = vi.fn();
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: contexte }),
  // `mutateAsync` (le verrou se libère à l'issue de la promesse) relayé à l'espion de la forme à rappels.
  useConsignerGesteDuClient: () => ({
    mutateAsync: (v: unknown) =>
      new Promise<void>((onSuccess, onError) => {
        suspens.push(() => onSuccess());
        consigner(v, { onSuccess: () => onSuccess(), onError: (e?: unknown) => onError(e) });
      }),
    isPending: gesteEnCours.valeur,
  }),
  useToggleMute: () => ({ mutate: sourdine }),
}));
// La feuille du bas lit `useMatchesMedia` pour sa propre forme : laissée au défaut.
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMaxWidth: () => compact, useMatchesMedia: () => false }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

const participant = (id: number, nom: string) => ({
  id: id * 10,
  user_id: id,
  role: 'member',
  last_read_at: null,
  joined_at: '',
  left_at: null,
  user: { id, full_name: nom, avatar_url: null },
});
const directe = {
  id: 7,
  type: 'direct',
  subject: null,
  maintenance_request_id: null,
  property: { id: 5, title: 'Maison avec jardin', slug: 'maison-avec-jardin', main_photo_url: null },
  participants: [participant(1, 'Sokhna Sène'), participant(2, 'Malick Seck')],
} as unknown as Conversation;
const groupe = {
  ...directe,
  type: 'group',
  subject: 'Suivi des impayés',
  property: undefined,
  participants: [participant(1, 'A'), participant(2, 'B'), participant(3, 'C')],
} as unknown as Conversation;

function avecClient(phone: string | null) {
  return { data: { property: null, lease: null, maintenance: null, customer: { id: 31, full_name: 'Malick Seck', stage: 'lead', phone, assigned_agent: null } } };
}

function monter(
  conversation: Conversation,
  props: Partial<{
    onInfosDuGroupe: () => void;
    sourdine: boolean;
    contexte: { ouvert: boolean; onBasculer: () => void };
    onPlusDActions: () => void;
  }> = {},
) {
  return render(
    withIntl(
      <EnTeteDuFil
        conversationId={conversation.id}
        conversation={conversation}
        onBack={() => {}}
        sourdine={props.sourdine ?? false}
        onInfosDuGroupe={props.onInfosDuGroupe ?? (() => {})}
        contexte={props.contexte}
        onPlusDActions={props.onPlusDActions}
      />,
    ),
  );
}

beforeEach(() => {
  contexte = { data: { property: null, lease: null, maintenance: null } };
  compact = false;
  consigner.mockReset();
  gesteEnCours.valeur = false;
  sourdine.mockReset();
});

afterEach(async () => {
  await act(async () => {
    suspens.splice(0).forEach((rendre) => rendre());
    await Promise.resolve();
  });
});

describe('<EnTeteDuFil> (TCK-2632)', () => {
  it('le titre est la personne ; le bien est un lien vers sa fiche, nommé « Voir le bien »', () => {
    monter(directe);
    expect(screen.getByRole('heading', { name: 'Malick Seck' })).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: /Voir le bien.*Maison avec jardin/ });
    expect(lien).toHaveAttribute('href', '/properties/maison-avec-jardin');
  });

  it('AC6 — sans client dans le contexte (un client connecté), ni appel ni WhatsApp', () => {
    monter(directe);
    expect(screen.queryByRole('link', { name: /Appeler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Joindre/ })).not.toBeInTheDocument();
  });

  it('un numéro qui n’est pas joignable (non E.164) n’ouvre rien', () => {
    contexte = avecClient('77 123');
    monter(directe);
    expect(screen.queryByRole('link', { name: /Appeler/ })).not.toBeInTheDocument();
  });

  it('au bureau : « Appeler » et WhatsApp, chacun consigné sur la fiche du client', async () => {
    contexte = avecClient('+221771234567');
    monter(directe);
    const appel = screen.getByRole('link', { name: 'Appeler Malick Seck' });
    expect(appel).toHaveAttribute('href', 'tel:+221771234567');
    appel.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(appel);
    expect(consigner).toHaveBeenLastCalledWith({ id: 31, channel: 'call' }, expect.anything());

    const whatsapp = screen.getByRole('link', { name: 'Écrire sur WhatsApp' });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221771234567/);
    whatsapp.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(whatsapp);
    expect(consigner).toHaveBeenLastCalledWith({ id: 31, channel: 'whatsapp' }, expect.anything());
  });

  it('au téléphone : « 📞 » ouvre la feuille, appeler ou écrire sur WhatsApp', async () => {
    compact = true;
    contexte = avecClient('+221771234567');
    monter(directe);
    expect(screen.queryByRole('link', { name: /Appeler/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Joindre Malick Seck' }));
    const appel = await screen.findByRole('link', { name: /Appeler/ });
    expect(appel).toHaveAttribute('href', 'tel:+221771234567');
    appel.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(appel);
    expect(consigner).toHaveBeenLastCalledWith({ id: 31, channel: 'call' }, expect.anything());
  });

  it('réserve de TCK-2632 — au bureau, double appui sur WhatsApp, geste en cours : un seul contact noté, un seul lien suivi', async () => {
    contexte = avecClient('+221771234567');
    const suivis: boolean[] = [];
    const relever = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('a[href^="https://wa.me"]')) suivis.push(!e.defaultPrevented);
    };
    document.addEventListener('click', relever);
    monter(directe);
    await userEvent.dblClick(screen.getByRole('link', { name: 'Écrire sur WhatsApp' }));
    document.removeEventListener('click', relever);
    expect(consigner).toHaveBeenCalledTimes(1);
    expect(suivis).toEqual([true, false]);
  });

  // Contre-vérification de 05be499f4 (ablation G3 : un verrou jamais relâché restait vert) — le
  // verrou ne vaut que pendant le geste : rendu, réussi ou refusé, le geste suivant repart.
  it.each([
    ['refusé', (o: { onError?: () => void; onSettled?: () => void }) => { o.onError?.(); o.onSettled?.(); }],
    ['réussi', (o: { onSuccess?: () => void; onSettled?: () => void }) => { o.onSuccess?.(); o.onSettled?.(); }],
  ])('réserve de TCK-2632 — le geste %s, l’appui suivant se note de nouveau', async (_issue, rendre) => {
    contexte = avecClient('+221771234567');
    consigner.mockImplementation((_v: unknown, o: Parameters<typeof rendre>[0]) => rendre(o));
    monter(directe);
    const appel = screen.getByRole('link', { name: 'Appeler Malick Seck' });
    appel.addEventListener('click', (e) => e.preventDefault());

    await userEvent.click(appel);
    await userEvent.click(appel);

    expect(consigner).toHaveBeenCalledTimes(2);
    expect(consigner).toHaveBeenLastCalledWith({ id: 31, channel: 'call' }, expect.anything());
  });

  it('réserve de TCK-2632 — au téléphone, double appui dans la feuille « Joindre » : un seul contact noté', async () => {
    compact = true;
    contexte = avecClient('+221771234567');
    monter(directe);
    await userEvent.click(screen.getByRole('button', { name: 'Joindre Malick Seck' }));
    const whatsapp = await screen.findByRole('link', { name: /WhatsApp/ });
    whatsapp.addEventListener('click', (e) => e.preventDefault());
    // Les deux appuis arrivent sur le lien avant que la feuille ne soit retirée.
    whatsapp.click();
    whatsapp.click();
    expect(consigner).toHaveBeenCalledTimes(1);
  });

  it('réserve de TCK-2632 — pendant le geste, appeler et WhatsApp se disent indisponibles et un appui ne note rien', async () => {
    gesteEnCours.valeur = true;
    contexte = avecClient('+221771234567');
    monter(directe);
    const appel = screen.getByRole('link', { name: 'Appeler Malick Seck' });
    const whatsapp = screen.getByRole('link', { name: 'Écrire sur WhatsApp' });
    expect(appel).toHaveAttribute('aria-disabled', 'true');
    expect(whatsapp).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(appel);
    await userEvent.click(whatsapp);
    expect(consigner).not.toHaveBeenCalled();
  });

  it('un groupe : « 3 personnes », et « ⋯ » ouvre ses infos', async () => {
    const infos = vi.fn();
    monter(groupe, { onInfosDuGroupe: infos });
    expect(screen.getByRole('heading', { name: 'Suivi des impayés' })).toBeInTheDocument();
    expect(screen.getByText('3 personnes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Infos du groupe' }));
    expect(infos).toHaveBeenCalledTimes(1);
    // Maquette a/5 : la sous-ligne « 3 personnes › » y mène aussi.
    await userEvent.click(await screen.findByRole('button', { name: /Infos du groupe.*3 personnes/ }));
    expect(infos).toHaveBeenCalledTimes(2);
  });

  it('« ⋯ » coupe les notifications, ou les réactive', async () => {
    const { unmount } = monter(directe);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const couper = await screen.findByRole('menuitem', { name: 'Couper les notifications' });
    // Menu OUVERT : un fil à deux n'a pas d'« Infos du groupe ».
    expect(screen.queryByRole('menuitem', { name: 'Infos du groupe' })).not.toBeInTheDocument();
    await userEvent.click(couper);
    expect(sourdine).toHaveBeenLastCalledWith({ is_muted: true }, expect.anything());
    unmount();

    monter(directe, { sourdine: true });
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Réactiver les notifications' }));
    expect(sourdine).toHaveBeenLastCalledWith({ is_muted: false }, expect.anything());
  });

  it('au téléphone, « ⋯ » d’un fil direct ouvre la feuille du fil (maquette a/2), pas le menu', async () => {
    compact = true;
    const feuille = vi.fn();
    const { unmount } = monter(directe, { onPlusDActions: feuille });
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(feuille).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    unmount();

    // Un groupe garde le menu (ses infos), même avec le rappel.
    monter(groupe, { onPlusDActions: feuille });
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Infos du groupe' })).toBeInTheDocument();
    expect(feuille).toHaveBeenCalledTimes(1);
  });

  it('P228.06 — un geste qui échoue se dit sous l’en-tête : la fiche n’a pas noté le contact ; la sourdine refusée', async () => {
    contexte = avecClient('+221771234567');
    consigner.mockImplementation((_v: unknown, o: { onError: () => void }) => o.onError());
    sourdine.mockImplementation((_v: unknown, o: { onError: (e: unknown) => void }) => o.onError(new Error('x')));
    monter(directe);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const appel = screen.getByRole('link', { name: 'Appeler Malick Seck' });
    appel.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(appel);
    expect(screen.getByRole('alert')).toHaveTextContent('Le contact n’a pas été noté sur la fiche du client.');

    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Couper les notifications' }));
    expect(screen.getByRole('alert')).not.toHaveTextContent('fiche du client');
    expect(screen.getByRole('alert').textContent).not.toBe('');
  });

  it('décision b — un fil que j’ai archivé, rouvert, se dit « Archivée » ; l’archive d’un AUTRE membre ne compte pas', () => {
    const archive = (userId: number) =>
      ({
        ...directe,
        participants: directe.participants!.map((p) => (p.user_id === userId ? { ...p, archived_at: '2026-11-01T10:00:00Z' } : p)),
      }) as unknown as Conversation;
    const { unmount } = monter(archive(1));
    expect(screen.getByTestId('fil-archive')).toHaveTextContent('Archivée');
    unmount();

    monter(archive(2));
    expect(screen.queryByTestId('fil-archive')).not.toBeInTheDocument();
  });

  it('au bureau, le bouton du contexte le replie ou l’affiche, et dit lequel', async () => {
    const onBasculer = vi.fn();
    const { rerender } = monter(directe, { contexte: { ouvert: true, onBasculer } });
    const bouton = screen.getByRole('button', { name: 'Replier le contexte' });
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(bouton).toHaveAttribute('aria-controls', 'messagerie-contexte');
    // Dès `xl` seulement : la colonne n'existe pas en dessous.
    expect(bouton).toHaveClass('hidden', 'xl:inline-flex');
    await userEvent.click(bouton);
    expect(onBasculer).toHaveBeenCalledTimes(1);

    rerender(
      withIntl(
        <EnTeteDuFil conversationId={7} conversation={directe} sourdine={false} onInfosDuGroupe={() => {}} contexte={{ ouvert: false, onBasculer }} />,
      ),
    );
    expect(screen.getByRole('button', { name: 'Afficher le contexte' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('ni au téléphone, ni sans colonne : pas de bouton du contexte', () => {
    compact = true;
    const { unmount } = monter(directe, { contexte: { ouvert: true, onBasculer: () => {} } });
    expect(screen.queryByRole('button', { name: /contexte/ })).not.toBeInTheDocument();
    unmount();
    compact = false;
    monter(directe);
    expect(screen.queryByRole('button', { name: /contexte/ })).not.toBeInTheDocument();
  });
});
