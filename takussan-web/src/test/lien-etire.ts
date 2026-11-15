import { expect } from 'vitest';

/**
 * TCK-2792 — le lien seul d'une carte (le nom, le titre) est ÉTIRÉ sur la tête de la carte, comme celui des
 * cartes de baux (`carte-d-attente`) et de clients : `after:absolute after:inset-0` sur le lien, et la tête en
 * `relative`. Sa zone de frappe est alors la tête entière (40 px et plus au téléphone), et non la ligne de
 * texte (18,8 à 21 px, relevé du 2026-11-13).
 *
 * jsdom ne pose aucune boîte : on juge la STRUCTURE qui fait la zone — le pseudo-élément absolu, le bloc
 * positionné qui le contient, ce que ce bloc enferme — et le navigateur juge la région (AC1 du ticket).
 */

const INTERACTIFS = 'a[href], button, input, select, textarea, label, [role="checkbox"], [role="button"]';
const POSITIONNE = /^(relative|absolute|fixed|sticky)$/;

const classes = (el: Element) => (typeof el.className === 'string' ? el.className : '').split(/\s+/);

/**
 * La zone que couvre le pseudo-élément du lien : le premier ancêtre POSITIONNÉ. Il doit porter `relative`
 * (un `absolute` ou un `sticky` déplacerait la zone ailleurs que sur la tête).
 */
export function zoneDuLienEtire(lien: HTMLElement): HTMLElement {
  expect(classes(lien), 'le lien porte son pseudo-élément absolu').toEqual(expect.arrayContaining(['after:absolute', 'after:inset-0']));
  let zone = lien.parentElement;
  while (zone && !classes(zone).some((c) => POSITIONNE.test(c))) zone = zone.parentElement;
  expect(zone, 'un ancêtre positionné porte la zone').not.toBeNull();
  expect(classes(zone as HTMLElement), 'la zone est en `relative`').toContain('relative');
  return zone as HTMLElement;
}

/**
 * La zone du lien est la tête de la carte : dans la carte, elle enferme le témoin (l'avatar, l'heure, la date —
 * ce qui donne sa hauteur à la tête), elle ne recouvre aucun geste, et tout autre contrôle qu'elle enferme
 * (la case de la file de relance) est posé AU-DESSUS d'elle (`relative z-10`).
 */
export function attendreLienEtire(
  lien: HTMLElement,
  { carte, temoins, gestes = [] }: { readonly carte: HTMLElement; readonly temoins: readonly HTMLElement[]; readonly gestes?: readonly HTMLElement[] },
): HTMLElement {
  const zone = zoneDuLienEtire(lien);
  expect(carte.contains(zone), 'la zone est dans la carte').toBe(true);
  for (const temoin of temoins) expect(zone.contains(temoin), `la zone enferme « ${temoin.textContent} »`).toBe(true);
  for (const geste of gestes) expect(zone.contains(geste), `la zone ne recouvre pas « ${geste.textContent} »`).toBe(false);
  const autres = [...zone.querySelectorAll<HTMLElement>(INTERACTIFS)].filter((e) => e !== lien && !lien.contains(e));
  for (const autre of autres) {
    let porteur: HTMLElement | null = autre;
    while (porteur && porteur !== zone && !(classes(porteur).includes('relative') && classes(porteur).includes('z-10'))) porteur = porteur.parentElement;
    expect(porteur !== zone && porteur !== null, `« ${autre.getAttribute('aria-label') ?? autre.textContent} » est posé au-dessus de la zone`).toBe(true);
  }
  return zone;
}
