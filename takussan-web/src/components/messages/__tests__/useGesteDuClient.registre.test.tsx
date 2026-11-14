/**
 * Contre-vérification de 05be499f4 (verif-commercial) — le verrou d'un geste de contact (appeler,
 * WhatsApp) vivait dans CHAQUE composant : au téléphone, l'en-tête du fil (`EnTeteDuFil`, sa feuille
 * « Joindre ») et la feuille du fil (`FeuilleDuFil`) en tenaient chacun un. Un appui sur WhatsApp
 * dans la feuille, la feuille fermée pendant l'envoi, puis WhatsApp dans l'en-tête : deux contacts
 * notés (l'API ne déduplique pas) et deux onglets wa.me. Le fil quitté puis rouvert pendant l'envoi :
 * même chose, le composant remonté repartait à zéro.
 *
 * Le verrou est désormais celui du CLIENT et du canal, au-dessus de tout composant ; il se libère à
 * l'issue de l'envoi, même si le composant qui l'a lancé est démonté entre-temps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { useGesteDuClient } from '../useGesteDuClient';

type Issue = { resoudre: () => void; rejeter: (e: unknown) => void };
const envois = vi.hoisted(() => ({ appels: [] as { id: number; channel: string }[], issues: [] as Issue[] }));

vi.mock('@/lib/queries/conversations', () => ({
  useConsignerGesteDuClient: () => ({
    isPending: false,
    mutateAsync: (vars: { id: number; channel: string }) =>
      new Promise<void>((resoudre, rejeter) => {
        envois.appels.push(vars);
        envois.issues.push({ resoudre, rejeter });
      }),
    // L'ancienne forme (rappels de `mutate`), pour que le test rougisse sur elle aussi.
    mutate: (vars: { id: number; channel: string }, o: { onSuccess?: () => void; onError?: () => void; onSettled?: () => void }) => {
      envois.appels.push(vars);
      envois.issues.push({
        resoudre: () => {
          o.onSuccess?.();
          o.onSettled?.();
        },
        rejeter: () => {
          o.onError?.();
          o.onSettled?.();
        },
      });
    },
  }),
}));

function Geste({ nom, client = 31, onSuccess }: { readonly nom: string; readonly client?: number; readonly onSuccess?: () => void }) {
  const { consigner, enCours } = useGesteDuClient(client);
  return (
    <a
      href="https://wa.me/221775124018"
      aria-disabled={enCours || undefined}
      onClick={(e) => {
        consigner(e, { id: client, channel: 'whatsapp' }, { onSuccess });
      }}
    >
      {nom}
    </a>
  );
}

/** Les clics suivis (non annulés) sur un lien wa.me. */
function releverLesClics() {
  const suivis: boolean[] = [];
  const relever = (e: Event) => {
    if ((e.target as HTMLElement).closest?.('a[href^="https://wa.me"]')) suivis.push(!e.defaultPrevented);
  };
  document.addEventListener('click', relever);
  return { suivis, arreter: () => document.removeEventListener('click', relever) };
}

async function toutRendre() {
  await act(async () => {
    envois.issues.splice(0).forEach((i) => i.resoudre());
    await Promise.resolve();
  });
}

beforeEach(() => {
  envois.appels = [];
  envois.issues = [];
});

afterEach(async () => {
  // Aucun verrou ne survit au test : tout envoi en suspens est rendu.
  await toutRendre();
});

describe('useGesteDuClient — un verrou par client et par canal, au-dessus des composants', () => {
  it('en-tête et feuille : WhatsApp dans l’une puis dans l’autre pendant l’envoi → un seul contact noté, un seul lien suivi', () => {
    const clics = releverLesClics();
    render(
      <>
        <Geste nom="feuille" />
        <Geste nom="en-tête" />
      </>,
    );
    fireEvent.click(screen.getByText('feuille'));
    fireEvent.click(screen.getByText('en-tête'));
    clics.arreter();

    expect(envois.appels).toEqual([{ id: 31, channel: 'whatsapp' }]);
    expect(clics.suivis).toEqual([true, false]);
    expect(screen.getByText('en-tête')).toHaveAttribute('aria-disabled', 'true');
  });

  it('le composant démonté puis remonté pendant l’envoi retrouve le verrou, et l’issue le libère', async () => {
    const { unmount } = render(<Geste nom="fil" />);
    fireEvent.click(screen.getByText('fil'));
    unmount();

    render(<Geste nom="fil" />);
    expect(screen.getByText('fil')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('fil'));
    expect(envois.appels).toHaveLength(1);

    await toutRendre();
    expect(screen.getByText('fil')).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByText('fil'));
    expect(envois.appels).toHaveLength(2);
  });

  it('un échec libère aussi le verrou, même composant démonté', async () => {
    const { unmount } = render(<Geste nom="fil" />);
    fireEvent.click(screen.getByText('fil'));
    unmount();
    await act(async () => {
      envois.issues.splice(0).forEach((i) => i.rejeter(new Error('réseau')));
      await Promise.resolve();
    });

    render(<Geste nom="fil" />);
    fireEvent.click(screen.getByText('fil'));
    expect(envois.appels).toHaveLength(2);
  });

  it('les rappels d’un composant démonté ne courent pas (la feuille rouverte ne se referme pas sur l’issue de l’ancienne)', async () => {
    const ancien = vi.fn();
    const { unmount } = render(<Geste nom="fil" onSuccess={ancien} />);
    fireEvent.click(screen.getByText('fil'));
    unmount();
    await toutRendre();
    expect(ancien).not.toHaveBeenCalled();
  });

  it('un autre client n’est pas verrouillé par le premier', () => {
    render(
      <>
        <Geste nom="client 31" />
        <Geste nom="client 32" client={32} />
      </>,
    );
    fireEvent.click(screen.getByText('client 31'));
    expect(screen.getByText('client 32')).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByText('client 32'));
    expect(envois.appels).toEqual([
      { id: 31, channel: 'whatsapp' },
      { id: 32, channel: 'whatsapp' },
    ]);
  });
});
