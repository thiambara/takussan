/**
 * LE MOTIF « ENCRE HÉRITÉE, FOND REPEINT » — SECONDE OCCURRENCE, TCK-481.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST MESURÉ ICI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le bandeau des codes de récupération pose `bg-warning/10 … text-warning` sur son `<div
 * role="status">`. Le bouton « Copier tout » repeignait son fond (`bg-warning/20`) **sans poser
 * d'encre** : il héritait le `text-warning` du bandeau, soit #8a5410 sur #decfbc — **4,10:1** sur
 * le fond réel, sous le seuil AA texte. C'est le motif de TCK-471, avec deux autres jetons : *un
 * couple `bg-<X> text-<Y>` sur un conteneur retourne deux propriétés, il ne retourne pas les
 * jetons.*
 *
 * ⚠ **Et le survol était pire que le repos, à 1,00:1.** `hover:bg-warning` repeignait le fond
 * avec la couleur EXACTE de l'encre héritée — le libellé disparaissait sous le curseur qui allait
 * le cliquer. Ce second défaut est invisible à `scripts/check-heritage-encre.mjs`, qui ne lit que
 * l'état AU REPOS ; il n'apparaît que parce que `fondsPossibles()` rend un fond par ÉTAT. *Un
 * contrôle qui n'éprouve que l'état du DOM au repos ne garde pas les états qu'on ne rend jamais
 * en test.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS LA PORTÉE `dark` DE TCK-471
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-471 a tranché pour la classe `dark` parce que son conteneur ÉTAIT une surface sombre
 * (`bg-foreground`) : basculer la table de jetons y rendait exactement la même surface, au pixel
 * près, avec des jetons accordés. Ici le conteneur est une surface **claire teintée** — un aplat
 * d'avertissement à 10 % sur `--card` blanc. Sous une portée `dark`, `--card` vaut #2a2018 et
 * `--warning` #e0a458 : le bandeau deviendrait une boîte SOMBRE au milieu d'une carte claire.
 * *La forme juste n'est pas la même parce que le défaut n'est pas le même : ici le conteneur ne
 * ment pas sur sa surface, c'est le descendant qui n'a pas d'encre.*
 *
 * Le correctif est donc celui que le design system écrit déjà pour un bouton dans un bandeau
 * `warning` — `CalendarPage.tsx:280` et `BrandingBanner.tsx:46` : le bouton pose SON fond et SON
 * encre. `bg-card text-warning` → **6,26:1**, `hover:bg-secondary` → **5,24:1**.
 *
 * ⚠ **Le survol de ces deux précédents est `hover:bg-warning/15`, et il ne tient PAS le seuil.**
 * C'est la première forme écrite ici, et c'est ce fichier qui l'a refusée : `background-color`
 * REMPLACE, il ne se superpose pas au fond propre du bouton — l'aplat à 15 % se compose donc sur
 * le bandeau teinté qui est DESSOUS (#f3eee7), pas sur le blanc du bouton, et rend #e3d7c7,
 * **4,41:1**. Le survol retenu est donc opaque. *Un aplat translucide ne se lit pas sur la surface
 * qu'il recouvre, mais sur celle qu'il ne recouvre plus* — et les deux précédents portent le même
 * écart, hors périmètre de ce ticket.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROUS, DÉCLARÉS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `--destructive` est en `oklch(…)` dans `globals.css` et n'est PAS dans `contraste-wcag.ts` :
 * le bouton « Désactiver » de cette carte est donc COMPTÉ et non mesuré, comme dans
 * `agency-detail-contrast.test.tsx`. Il pose son encre lui-même (`text-destructive`), le motif de
 * ce ticket ne le concerne pas.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import {
  JETONS_CLAIR,
  REPOS,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
} from '@/test/contraste-wcag';

import { TwoFactorSection } from '../security/TwoFactorSection';

const enableMock = vi.fn();
const confirmMock = vi.fn();
const disableMock = vi.fn();
const regenMock = vi.fn();

vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: () => enableMock(),
  twoFactorConfirmAction: (code: string) => confirmMock(code),
  twoFactorDisableAction: (payload: { password?: string; code?: string }) => disableMock(payload),
  twoFactorRegenerateAction: () => regenMock(),
}));

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LE DÉTECTEUR
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** L'encre que l'élément déclare LUI-MÊME au repos, ou `null` s'il l'hérite. */
function encrePropre(element: Element): { jeton: string; alpha: number } | null {
  for (const classe of element.classList) {
    const u = litUtilitaireDeCouleur(classe, 'text');
    if (u && u.variante === '' && u.jeton !== 'transparent') return { jeton: u.jeton, alpha: u.alpha };
  }
  return null;
}

/**
 * L'encre RENDUE d'un élément : la sienne, sinon celle du premier ancêtre qui en déclare une,
 * sinon `--foreground` — ce que le navigateur applique quand personne n'a rien dit.
 */
function encreEffective(element: Element): { jeton: string; alpha: number; provenance: string } {
  const propre = encrePropre(element);
  if (propre) return { ...propre, provenance: `text-${propre.jeton} (à lui)` };
  let ancetre = element.parentElement;
  while (ancetre) {
    const heritee = encrePropre(ancetre);
    if (heritee) {
      return {
        ...heritee,
        provenance: `text-${heritee.jeton} HÉRITÉ de <${ancetre.tagName.toLowerCase()}>`,
      };
    }
    ancetre = ancetre.parentElement;
  }
  return { jeton: 'foreground', alpha: 1, provenance: '--foreground (défaut du navigateur)' };
}

/**
 * Le texte que l'élément affiche LUI-MÊME — ses nœuds texte directs, pas ceux de ses enfants.
 *
 * ⚠ Sans cette restriction, chaque ancêtre est mesuré une fois par mot de son sous-arbre : le
 * `<div>` de la carte porterait le texte de tous ses descendants, avec SON fond et SON encre, et
 * on mesurerait des couples que personne ne rend. C'est la même question que le `porteDuTexte()`
 * de `scripts/check-heritage-encre.mjs`, prise par l'autre bout.
 */
function texteDirect(element: Element): string {
  return Array.from(element.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();
}

interface Mesure {
  readonly quoi: string;
  readonly etat: string;
  readonly encre: string;
  readonly fond: string;
  readonly ratio: number;
  readonly provenance: string;
}

/**
 * TOUS les textes d'un sous-arbre, mesurés sur TOUS les fonds que leur élément peut avoir —
 * `hover:` compris. C'est l'AC2 : *un correctif qui réparerait l'un en cassant l'autre passerait
 * un contrôle qui n'en regarde qu'un.*
 *
 * `jetonsInconnus` recueille ce que la table ne sait pas résoudre (`--destructive`) : compté,
 * jamais mesuré contre une valeur de repli.
 */
function mesurerTousLesTextes(racine: Element, jetonsInconnus: string[] = []): Mesure[] {
  const out: Mesure[] = [];
  for (const element of [racine, ...racine.querySelectorAll('*')]) {
    const texte = texteDirect(element);
    if (texte === '') continue;
    const encre = encreEffective(element);
    try {
      const hexEncre = resoudreCouleur(encre.jeton, JETONS_CLAIR);
      for (const fond of fondsPossibles(element, JETONS_CLAIR)) {
        const posee = encre.alpha === 1
          ? versRvb(hexEncre)
          : composer(versRvb(hexEncre), versRvb(fond.hex), encre.alpha);
        out.push({
          quoi: `${element.tagName.toLowerCase()} « ${texte.slice(0, 32)} »`,
          etat: fond.etat,
          encre: versHex(posee),
          fond: fond.hex,
          ratio: contraste(posee, versRvb(fond.hex)),
          provenance: `${encre.provenance} · ${fond.provenance}`,
        });
      }
    } catch (erreur) {
      jetonsInconnus.push(`${element.tagName.toLowerCase()} : ${(erreur as Error).message}`);
    }
  }
  return out;
}

const echecs = (mesures: Mesure[]) => mesures
  .filter((m) => m.ratio < SEUIL_AA_TEXTE)
  .map((m) => `${m.quoi} [${m.etat}] ${m.encre} sur ${m.fond} = ${fmt(m.ratio)} — ${m.provenance}`);

/** Amène le composant à l'état qui affiche le bandeau des codes de récupération. */
async function rendreAvecCodes() {
  const user = userEvent.setup();
  enableMock.mockResolvedValue({ ok: true, data: { secret: 'SECRET_KEY', qr_url: 'otpauth://x' } });
  confirmMock.mockResolvedValue({
    ok: true,
    data: { enabled: true, recovery_codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] },
  });
  const rendu = render(withIntl(<TwoFactorSection enabled={false} />));

  await user.click(screen.getByRole('button', { name: /activer la 2fa/i }));
  await waitFor(() => screen.getByPlaceholderText('123456'));
  await user.type(screen.getByPlaceholderText('123456'), '123456');
  await user.click(screen.getByRole('button', { name: /confirmer et activer/i }));
  await waitFor(() => expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument());

  return rendu;
}

beforeEach(() => {
  enableMock.mockReset();
  confirmMock.mockReset();
  disableMock.mockReset();
  regenMock.mockReset();
});
afterEach(() => cleanup());

describe('TwoFactorSection — encre héritée sur fond repeint (TCK-481)', () => {
  it("le détecteur REFUSE le motif d'avant correction — sinon tout le reste est vert par vacuité", () => {
    // Le bandeau TEL QU'IL ÉTAIT, reconstruit à la main : conteneur `bg-warning/10 text-warning`,
    // bouton qui repeint son fond sans poser d'encre, et un survol qui repeint avec l'encre même.
    const { container } = render(
      <div className="bg-card p-6">
        <div role="status" className="rounded-md bg-warning/10 p-4 text-sm text-warning">
          <p className="font-semibold">Codes de récupération</p>
          <button type="button" className="rounded-md bg-warning/20 px-3 py-1 text-xs hover:bg-warning">
            Copier tout
          </button>
        </div>
      </div>,
    );
    const fautes = echecs(mesurerTousLesTextes(container.firstElementChild!));

    expect(fautes.length, 'le motif reconstruit passe le détecteur : il ne garde rien').toBeGreaterThan(0);
    // Les deux chiffres du ticket, RECALCULÉS et non recopiés : le repos et le survol.
    expect(fautes.join('\n')).toContain('#8a5410 sur #decfbc = 4,10:1');
    expect(fautes.join('\n')).toContain('#8a5410 sur #8a5410 = 1,00:1');
  });

  it("…et il ne rougit PAS quand le bouton pose son fond et son encre (pas de faux positif)", () => {
    const { container } = render(
      <div className="bg-card p-6">
        <div role="status" className="rounded-md bg-warning/10 p-4 text-sm text-warning">
          <p className="font-semibold">Codes de récupération</p>
          <button
            type="button"
            className="rounded-md bg-card px-3 py-1 text-xs text-warning hover:bg-secondary"
          >
            Copier tout
          </button>
        </div>
      </div>,
    );
    expect(echecs(mesurerTousLesTextes(container.firstElementChild!))).toEqual([]);
  });

  it('AC1/AC2 — tous les textes du bandeau RENDU tiennent le seuil AA, dans tous leurs états', async () => {
    const inconnus: string[] = [];
    const { container } = await rendreAvecCodes();
    const bandeau = container.querySelector('[role="status"]')!;

    const mesures = mesurerTousLesTextes(bandeau, inconnus);
    expect(echecs(mesures), 'un texte du bandeau est sous 4,5:1').toEqual([]);

    // Une garde qui n'a plus rien à mesurer rend le même vert qu'une garde satisfaite : le bouton
    // « Copier tout » DOIT être passé au détecteur, et dans ses DEUX états.
    const bouton = bandeau.querySelector('button')!;
    expect(bouton.textContent).toBeTruthy();
    const duBouton = mesures.filter((m) => m.quoi.startsWith('button'));
    expect(duBouton.map((m) => m.etat).sort()).toEqual(['hover', REPOS]);
    // …et il pose bien son encre, au lieu de l'hériter : c'est LE delta du ticket.
    expect(duBouton.every((m) => m.provenance.includes('(à lui)'))).toBe(true);
    // AC2 : les autres textes du bandeau sont mesurés, pas seulement celui du cliquet.
    expect(mesures.filter((m) => !m.quoi.startsWith('button')).length).toBeGreaterThanOrEqual(4);
    expect(inconnus).toEqual([]);
  });

  it('AC2 — et les textes de toute la carte 2FA, pas seulement ceux du bandeau', async () => {
    const inconnus: string[] = [];
    const { container } = await rendreAvecCodes();

    expect(echecs(mesurerTousLesTextes(container.firstElementChild!, inconnus))).toEqual([]);
    // `--destructive` est un trou DÉCLARÉ, pas un oubli : il doit rester le seul.
    expect(inconnus.join(' | ')).toMatch(/^$|destructive/);
  });
});
