/**
 * TCK-2736 — l'URL signée d'une pièce jointe expire en 5 minutes. Un participant qui garde le fil
 * ouvert plus longtemps ne doit voir ni 403 ni erreur : le lien périmé relit le fil avant d'ouvrir,
 * la note vocale relit le fil après son échec et rejoue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AGE_MAX_D_UN_LIEN_MS,
  LienDePieceJointe,
  lienPerime,
  urlDeLaPiece,
  useLecteurDePieceAudio,
  type RelirePiece,
} from '../PieceJointeDuFil';
import type { MessageAttachment } from '@/types/message';

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
const enSecondes = (ms: number) => Math.floor(ms / 1000);

function piece(url: string): MessageAttachment {
  return { id: 41, name: 'plan.pdf', url, mime_type: 'application/pdf', size: 10 };
}
const urlSignee = (expiresMs: number, sig = 'a') =>
  `https://api.test/api/media/private/9?expires=${enSecondes(expiresMs)}&signature=${sig}`;

let maintenant = T0;
beforeEach(() => {
  maintenant = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => maintenant);
});
afterEach(() => vi.restoreAllMocks());

describe('lienPerime', () => {
  it("tient pour périmée une URL vue il y a plus de 4 minutes, quelle que soit l'horloge de l'API", () => {
    const loin = urlSignee(T0 + 3_600_000);
    expect(lienPerime(loin, T0, T0 + AGE_MAX_D_UN_LIEN_MS)).toBe(false);
    expect(lienPerime(loin, T0, T0 + AGE_MAX_D_UN_LIEN_MS + 1)).toBe(true);
  });

  it("tient pour périmée une URL dont l'expiration tombe dans la minute", () => {
    expect(lienPerime(urlSignee(T0 + 59_000), null, T0)).toBe(true);
    expect(lienPerime(urlSignee(T0 + 120_000), null, T0)).toBe(false);
  });

  it('laisse une URL sans `expires` telle quelle', () => {
    expect(lienPerime('https://api.test/fichier.pdf', null, T0)).toBe(false);
  });

  it("reprend l'URL d'une pièce par son identifiant dans les pages relues", () => {
    const data = {
      pageParams: [undefined],
      pages: [{ meta: { has_more: false }, data: [{ id: 1, attachments: [piece('neuve')] }] }],
    } as never;
    expect(urlDeLaPiece(data, 41)).toBe('neuve');
    expect(urlDeLaPiece(data, 42)).toBeNull();
  });
});

describe('<LienDePieceJointe>', () => {
  function onglet() {
    const faux = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(faux as unknown as Window);
    return faux;
  }

  it("un lien frais s'ouvre tel quel, sans relire le fil", () => {
    const open = vi.spyOn(window, 'open');
    const relire = vi.fn();
    render(
      <LienDePieceJointe piece={piece(urlSignee(T0 + 300_000))} relirePiece={relire}>
        plan.pdf
      </LienDePieceJointe>,
    );

    const lien = screen.getByRole('link', { name: 'plan.pdf' });
    const clic = fireEvent.click(lien);

    expect(clic).toBe(true); // navigation par défaut conservée
    expect(relire).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(lien.getAttribute('href')).toBe(urlSignee(T0 + 300_000));
  });

  it("un lien expiré ouvre l'onglet dans le geste, relit le fil, puis y charge l'URL neuve", async () => {
    const faux = onglet();
    const relire = vi.fn().mockResolvedValue('https://api.test/neuve');
    render(
      <LienDePieceJointe piece={piece(urlSignee(T0 - 1_000))} relirePiece={relire}>
        plan.pdf
      </LienDePieceJointe>,
    );

    const clic = fireEvent.click(screen.getByRole('link', { name: 'plan.pdf' }));

    expect(clic).toBe(false); // l'ancienne URL n'est pas suivie
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(relire).toHaveBeenCalledWith(41);
    await waitFor(() => expect(faux.location.href).toBe('https://api.test/neuve'));
    expect(faux.opener).toBeNull();
    expect(faux.close).not.toHaveBeenCalled();
  });

  it('un lien vu il y a plus de 4 minutes relit le fil, même si sa signature court encore', async () => {
    const faux = onglet();
    const relire = vi.fn().mockResolvedValue('https://api.test/neuve');
    render(
      <LienDePieceJointe piece={piece(urlSignee(T0 + 3_600_000))} relirePiece={relire}>
        plan.pdf
      </LienDePieceJointe>,
    );

    maintenant = T0 + AGE_MAX_D_UN_LIEN_MS + 1;
    fireEvent.click(screen.getByRole('link', { name: 'plan.pdf' }));

    expect(relire).toHaveBeenCalledWith(41);
    await waitFor(() => expect(faux.location.href).toBe('https://api.test/neuve'));
  });

  it("referme l'onglet si le fil ne se relit pas, sans boucler", async () => {
    const faux = onglet();
    const relire = vi.fn().mockResolvedValue(null);
    render(
      <LienDePieceJointe piece={piece(urlSignee(T0 - 1_000))} relirePiece={relire}>
        plan.pdf
      </LienDePieceJointe>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'plan.pdf' }));

    await waitFor(() => expect(faux.close).toHaveBeenCalledTimes(1));
    expect(faux.location.href).toBe('');
    expect(relire).toHaveBeenCalledTimes(1);
  });
});

/** Le `<audio>` reste dans `ChatView` (sous-titres gelés) : le banc le monte comme lui. */
function Lecteur({ piece: p, relirePiece }: { piece: MessageAttachment; relirePiece: RelirePiece }) {
  const { ref: audioRef, src, onError } = useLecteurDePieceAudio(p, relirePiece);
  // eslint-disable-next-line jsx-a11y/media-has-caption -- banc de test : l'élément de ChatView, tel quel
  return <audio ref={audioRef} src={src} onError={onError} preload="none" />;
}

describe('useLecteurDePieceAudio', () => {
  function monter(relire: RelirePiece, url = urlSignee(T0 + 300_000)) {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const vue = render(<Lecteur piece={piece(url)} relirePiece={relire} />);
    const audio = () => vue.container.querySelector('audio')!;
    return { play, audio, vue };
  }

  it("sur un échec de chargement, relit le fil, prend l'URL neuve et rejoue", async () => {
    const relire = vi.fn().mockResolvedValue('https://api.test/neuve');
    const { play, audio } = monter(relire, urlSignee(T0 - 1_000));

    await act(async () => {
      fireEvent.error(audio());
    });

    expect(relire).toHaveBeenCalledWith(41);
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://api.test/neuve'));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("ne relit qu'une fois un fichier qui échoue sur une URL fraîche — pas de boucle", async () => {
    let n = 0;
    const relire = vi.fn().mockImplementation(async () => `https://api.test/neuve-${++n}`);
    const { audio } = monter(relire);

    await act(async () => {
      fireEvent.error(audio());
    });
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://api.test/neuve-1'));
    await act(async () => {
      fireEvent.error(audio());
    });

    expect(relire).toHaveBeenCalledTimes(1);
  });

  it("ne boucle pas non plus quand l'horloge du navigateur avance sur celle de l'API", async () => {
    // `expires` déjà passé pour le navigateur, mais l'URL vient d'arriver : l'âge seul décide.
    let n = 0;
    const relire = vi.fn().mockImplementation(async () => urlSignee(T0 - 10_000, `s${++n}`));
    const { audio } = monter(relire, urlSignee(T0 - 10_000));

    await act(async () => {
      fireEvent.error(audio());
    });
    await waitFor(() => expect(audio().getAttribute('src')).toBe(urlSignee(T0 - 10_000, 's1')));
    await act(async () => {
      fireEvent.error(audio());
    });

    expect(relire).toHaveBeenCalledTimes(1);
  });

  it('relit de nouveau une URL vue depuis plus de 4 minutes', async () => {
    let n = 0;
    const relire = vi.fn().mockImplementation(async () => `https://api.test/neuve-${++n}`);
    const { audio } = monter(relire);

    await act(async () => {
      fireEvent.error(audio());
    });
    await waitFor(() => expect(audio().getAttribute('src')).toBe('https://api.test/neuve-1'));
    maintenant = T0 + AGE_MAX_D_UN_LIEN_MS + 1;
    await act(async () => {
      fireEvent.error(audio());
    });

    expect(relire).toHaveBeenCalledTimes(2);
  });

  it("laisse le lecteur tel quel si le fil ne se relit pas", async () => {
    const relire = vi.fn().mockResolvedValue(null);
    const { play, audio } = monter(relire);
    const avant = audio().getAttribute('src');

    await act(async () => {
      fireEvent.error(audio());
    });

    expect(relire).toHaveBeenCalledTimes(1);
    expect(audio().getAttribute('src')).toBe(avant);
    expect(play).not.toHaveBeenCalled();
  });
});
