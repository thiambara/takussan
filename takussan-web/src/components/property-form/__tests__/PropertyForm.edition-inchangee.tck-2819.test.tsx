import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { MediaDropzone } from '@/components/media';
import { PropertyForm } from '../PropertyForm';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';

/**
 * TCK-2819 (lot 2) — la page d'ÉDITION d'un bien ne change pas quand l'assistant de création change.
 *
 * Le lot 2 a redessiné l'assistant d'après la maquette `app-entree-publier` en touchant des pièces que
 * l'édition monte aussi : `ChampsPosition` (variante `presentation`), `EntryCostFields` (dans
 * `StepPrix.tsx`, frais d'agence retirés par `useRetirerLesFraisDAgence`), `ChampsLieu`, et
 * `MediaManager.tsx` (`useDepotDeFichiers` extrait de `MediaDropzone`). Ce test fige ce que l'édition
 * rend pour un bien complet — sections et leur ordre, champs et leurs valeurs, boutons, pied — et,
 * pour les sections Prix et Localisation qui portent les pièces partagées, chaque élément avec ses
 * classes. `MediaDropzone` n'est pas monté par l'édition (les photos passent par `PropertyMediaPanel`) :
 * il est figé à part, puisque le lot l'a réécrit.
 *
 * L'empreinte attendue a été RELEVÉE sur l'état d'avant le lot (294dff09f), puis ce même fichier a été
 * rejoué sur l'arbre du lot : vert des deux côtés. Ablation : `presentation="assistant"` forcé sur le
 * `ChampsPosition` de l'édition → rouge (`sm:flex-row` devient `lg:flex-row`, bouton en pastille).
 *
 * Seul écart relevé, accepté (l'apostrophe typographique est la norme du texte affiché) : le lot a passé
 * `property.wizard.entryCost.advance` et `.agencyFee` de l'apostrophe droite à l'apostrophe
 * typographique (« Mois d’avance », « Frais d’agence (en mois de loyer) »). L'empreinte porte la
 * nouvelle graphie, et elle seule.
 */

vi.mock('@/app/actions/dashboard-properties', () => ({
  updatePropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="location-picker-map" />,
}));

/** Une location mensuelle complète : prix, coût d'entrée (frais d'agence compris), lieu, position. */
function bienComplet(kind: 'agency' | 'individual' = 'agency'): PropertyDetail {
  return {
    id: 7,
    title: 'Appartement 3 chambres aux Almadies',
    type: 'apartment',
    contract_type: 'rent',
    price: 450_000,
    currency: 'XOF',
    rent_period: 'monthly',
    available_from: '2026-12-01',
    condition: 'good',
    area: 120,
    bedrooms: 3,
    bathrooms: 2,
    floor_number: 2,
    total_floors: 4,
    year_built: 2015,
    parking_spaces: 1,
    furnished: true,
    description: 'Lumineux, proche de la plage.',
    virtual_tour_url: 'https://example.test/visite',
    entry_cost: { advance_months: 2, deposit_months: 2, agency_fee_months: 1, monthly_charges: 15_000, total: 0 },
    agency: { id: 3, name: 'Agence', slug: 'agence', logo_url: null, verified: true, rating: null, kind },
    location: {
      full: 'Almadies, Dakar',
      street: 'Route des Almadies',
      quarter: 'Almadies',
      city: 'Dakar',
      region: 'Dakar',
      postal_code: '10700',
      country: 'SN',
      latitude: 14.7453,
      longitude: -17.5133,
      geo_city_id: null,
      geo_neighborhood_id: null,
    },
    tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null }],
  } as never;
}

const TAGS: Tag[] = [
  { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, description: null },
] as never;

function texte(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Les attributs qui portent la mise en page et le sens ; jamais les identifiants de `useId`. */
const ATTRIBUTS = [
  'type', 'role', 'name', 'inputmode', 'placeholder', 'min', 'max', 'step', 'maxlength', 'aria-label',
  'data-testid', 'disabled', 'accept', 'capture', 'multiple',
];

function texteDirect(el: Element): string {
  return texte(
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' '),
  );
}

/** Chaque élément d'un sous-arbre : balise, classes, attributs de sens, texte propre. */
function elements(racine: Element): string[] {
  return Array.from(racine.querySelectorAll('*')).map((el) => {
    const attrs = ATTRIBUTS.filter((a) => el.hasAttribute(a))
      .map((a) => `${a}=${texte(el.getAttribute(a) ?? '')}`)
      .join(' ');
    const propre = texteDirect(el);
    return [el.tagName.toLowerCase(), `.${el.getAttribute('class') ?? ''}`, attrs, propre ? `«${propre}»` : '']
      .filter(Boolean)
      .join(' ');
  });
}

function nomDuChamp(el: HTMLElement): string {
  const lie = (el as HTMLInputElement).labels?.[0]?.textContent;
  if (lie) return texte(lie);
  const par = el.getAttribute('aria-labelledby');
  if (par) return texte(par.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
  return texte(el.getAttribute('aria-label') ?? '');
}

function empreinte(form: HTMLFormElement) {
  const sections = Array.from(form.querySelectorAll('section'));
  return {
    sections: sections.map((s) => [texte(s.querySelector('h2')?.textContent ?? ''), texte(s.querySelector('header p')?.textContent ?? '')]),
    champs: Array.from(form.querySelectorAll<HTMLElement>('input, textarea, select, [role="combobox"]')).map(
      (el) =>
        `${nomDuChamp(el)} | ${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''} | ${texte(
          (el as HTMLInputElement).value ?? el.textContent ?? '',
        )}`,
    ),
    boutons: Array.from(form.querySelectorAll('button')).map((b) => texte(b.getAttribute('aria-label') ?? b.textContent ?? '')),
    depotsDeFichiers: form.querySelectorAll('input[type="file"]').length,
    pied: texte(form.querySelector('[aria-live="polite"]')?.textContent ?? ''),
    prix: elements(sections[1]),
    localisation: elements(sections[2]),
  };
}

function avecIntl(enfant: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Africa/Dakar">
      {enfant}
    </NextIntlClientProvider>
  );
}

function rendre(bien: PropertyDetail) {
  const { container } = render(avecIntl(<PropertyForm mode="edit" property={bien} tags={TAGS} />));
  return container.querySelector('form') as HTMLFormElement;
}

// ── L'empreinte relevée sur 294dff09f, l'état d'avant le lot 2, aux deux libellés d'apostrophe près (cf. l'en-tête). ──

const ATTENDU_AGENCE = {
  "sections": [
    [
      "Informations générales",
      "Titre, type et contrat définissent la fiche publique du bien."
    ],
    [
      "Prix",
      "Loyer périodique. Indiquez aussi la fréquence."
    ],
    [
      "Localisation",
      "La ville est obligatoire. Cliquez sur la carte pour placer le marqueur GPS."
    ],
    [
      "Caractéristiques",
      "Optionnel. Renseigner les informations accessibles aux locataires / acheteurs."
    ],
    [
      "Description",
      "Soyez concret : état, commodités, voisinage."
    ],
    [
      "Équipements",
      ""
    ]
  ],
  "champs": [
    "Titre* | input | Appartement 3 chambres aux Almadies",
    "Type de bien* | button[button] | ",
    " | input | apartment",
    "Type de contrat* | button[button] | ",
    " | input | rent",
    "Prix* | input[text] | 450 000",
    "Fréquence | button[button] | ",
    " | input | monthly",
    "Mois d’avance | input[number] | 2",
    "Mois de caution | input[number] | 2",
    "Frais d’agence (en mois de loyer) | input[number] | 1",
    "Charges mensuelles | input[text] | 15 000",
    "Région | input | Dakar",
    " | input | ",
    "Ville* | input | Dakar",
    " | input | ",
    "Quartier | input | Almadies",
    " | input | ",
    "Rue / adresse | input | Route des Almadies",
    "Code postal | input | 10700",
    "Pays (code ISO) | input | SN",
    "Coller un lien ou une position | input | ",
    "Latitude | input[number] | 14.7453",
    "Longitude | input[number] | -17.5133",
    "Surface habitable (m²) | input[number] | 120",
    "Chambres | button[button] | ",
    " | input | 3",
    "Salles de bain | button[button] | ",
    " | input | 2",
    "Étage | button[button] | ",
    " | input | 2",
    "Année de construction | button[button] | ",
    " | input | 2015",
    "Places de parking | button[button] | ",
    " | input | 1",
    "Meublé | input[checkbox] | on",
    "État du bien | button[button] | ",
    " | input | good",
    "Description | textarea | Lumineux, proche de la plage.",
    "Visite virtuelle ou vidéo (lien) | input[url] | https://example.test/visite",
    "Sélectionnez les équipements et commodités disponibles. | input | ",
    " | input | "
  ],
  "boutons": [
    "Appartement▼",
    "Location▼",
    "Mois▼",
    "Placer sur la carte",
    "3▼",
    "2▼",
    "2▼",
    "2015▼",
    "1▼",
    "Bon état▼",
    "1 décembre 2026",
    "Retirer Piscine",
    "Annuler",
    "Enregistrer les modifications"
  ],
  "depotsDeFichiers": 0,
  "pied": "Aucune modification.",
  "prix": [
    "header .",
    "h2 .text-base font-semibold text-foreground «Prix»",
    "p .text-xs text-muted-foreground «Loyer périodique. Indiquez aussi la fréquence.»",
    "div .grid gap-4 md:grid-cols-2",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Prix»",
    "span .ml-0.5 text-destructive «*»",
    "div .",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 tabular-nums type=text name=price inputmode=numeric placeholder=150 000",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Fréquence»",
    "button .in-data-[field-density=comfortable]:data-[size=default]:h-controle-confortable plancher-tactile-10 flex items-center justify-between gap-1.5 rounded-lg border border-input bg-fond-champ py-2 pr-2.5 pl-3 text-declencheur whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground h-controle data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 w-full type=button role=combobox",
    "span .flex flex-1 text-left «Mois»",
    "svg .lucide lucide-chevron-down pointer-events-none size-4 text-muted-foreground «▼»",
    "path .",
    "input .",
    "fieldset .space-y-3 pt-1",
    "legend .text-sm font-medium text-foreground «Coût d’entrée»",
    "p .text-xs text-muted-foreground «Ce que le locataire verse pour emménager. Laissez vide ce qui ne s'applique pas.»",
    "div .grid gap-4 sm:grid-cols-3",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Mois d’avance»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 type=number name=advance_months inputmode=numeric min=0 max=24 step=1",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Mois de caution»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 type=number name=deposit_months inputmode=numeric min=0 max=24 step=1",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Frais d’agence (en mois de loyer)»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 type=number name=agency_fee_months inputmode=decimal min=0 max=24 step=0.5",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Charges mensuelles»",
    "div .",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 tabular-nums type=text name=monthly_charges inputmode=numeric placeholder=10 000"
  ],
  "localisation": [
    "header .",
    "h2 .text-base font-semibold text-foreground «Localisation»",
    "p .text-xs text-muted-foreground «La ville est obligatoire. Cliquez sur la carte pour placer le marqueur GPS.»",
    "div .grid gap-4 md:grid-cols-3",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Région»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Choisir une région",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Ville»",
    "span .ml-0.5 text-destructive «*»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Rechercher une ville",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Quartier»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Rechercher ou saisir un quartier",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "p .mt-1 text-[0.6875rem] text-muted-foreground «Régions, villes et quartiers : © les contributeurs d’OpenStreetMap (ODbL)»",
    "div .grid gap-4 md:grid-cols-3",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Rue / adresse»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=street placeholder=12 Rue des Jacarandas",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Code postal»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=postal_code placeholder=10700",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Pays (code ISO)»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=country placeholder=SN maxlength=2",
    "div .space-y-3",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Coller un lien ou une position»",
    "div .flex flex-col gap-2 sm:flex-row",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 placeholder=Lien Google Maps, position WhatsApp, Plus Code ou coordonnées",
    "button .inline-flex items-center justify-center rounded-lg border bg-clip-padding text-bouton font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:scale-[0.96] motion-reduce:active:not-aria-[haspopup]:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-fond-contour hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-controle gap-1.5 px-3.5 plancher-tactile-10 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 min-h-11 shrink-0 type=button «Placer sur la carte»",
    "svg .lucide lucide-map-pin",
    "path .",
    "circle .",
    "div .grid grid-cols-2 gap-3",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Latitude»",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 type=number name=latitude inputmode=decimal step=any",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Longitude»",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 type=number name=longitude inputmode=decimal step=any",
    "div . data-testid=location-picker-map",
    "p .text-xs text-muted-foreground «Cliquez sur la carte ou faites glisser le marqueur pour ajuster la position.»"
  ]
};

const ATTENDU_INDEPENDANT = {
  "sections": [
    [
      "Informations générales",
      "Titre, type et contrat définissent la fiche publique du bien."
    ],
    [
      "Prix",
      "Loyer périodique. Indiquez aussi la fréquence."
    ],
    [
      "Localisation",
      "La ville est obligatoire. Cliquez sur la carte pour placer le marqueur GPS."
    ],
    [
      "Caractéristiques",
      "Optionnel. Renseigner les informations accessibles aux locataires / acheteurs."
    ],
    [
      "Description",
      "Soyez concret : état, commodités, voisinage."
    ],
    [
      "Équipements",
      ""
    ]
  ],
  "champs": [
    "Titre* | input | Appartement 3 chambres aux Almadies",
    "Type de bien* | button[button] | ",
    " | input | apartment",
    "Type de contrat* | button[button] | ",
    " | input | rent",
    "Prix* | input[text] | 450 000",
    "Fréquence | button[button] | ",
    " | input | monthly",
    "Mois d’avance | input[number] | 2",
    "Mois de caution | input[number] | 2",
    "Charges mensuelles | input[text] | 15 000",
    "Région | input | Dakar",
    " | input | ",
    "Ville* | input | Dakar",
    " | input | ",
    "Quartier | input | Almadies",
    " | input | ",
    "Rue / adresse | input | Route des Almadies",
    "Code postal | input | 10700",
    "Pays (code ISO) | input | SN",
    "Coller un lien ou une position | input | ",
    "Latitude | input[number] | 14.7453",
    "Longitude | input[number] | -17.5133",
    "Surface habitable (m²) | input[number] | 120",
    "Chambres | button[button] | ",
    " | input | 3",
    "Salles de bain | button[button] | ",
    " | input | 2",
    "Étage | button[button] | ",
    " | input | 2",
    "Année de construction | button[button] | ",
    " | input | 2015",
    "Places de parking | button[button] | ",
    " | input | 1",
    "Meublé | input[checkbox] | on",
    "État du bien | button[button] | ",
    " | input | good",
    "Description | textarea | Lumineux, proche de la plage.",
    "Visite virtuelle ou vidéo (lien) | input[url] | https://example.test/visite",
    "Sélectionnez les équipements et commodités disponibles. | input | ",
    " | input | "
  ],
  "boutons": [
    "Appartement▼",
    "Location▼",
    "Mois▼",
    "Placer sur la carte",
    "3▼",
    "2▼",
    "2▼",
    "2015▼",
    "1▼",
    "Bon état▼",
    "1 décembre 2026",
    "Retirer Piscine",
    "Annuler",
    "Enregistrer les modifications"
  ],
  "depotsDeFichiers": 0,
  "pied": "1 champ modifié · non enregistré",
  "prix": [
    "header .",
    "h2 .text-base font-semibold text-foreground «Prix»",
    "p .text-xs text-muted-foreground «Loyer périodique. Indiquez aussi la fréquence.»",
    "div .grid gap-4 md:grid-cols-2",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Prix»",
    "span .ml-0.5 text-destructive «*»",
    "div .",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 tabular-nums type=text name=price inputmode=numeric placeholder=150 000",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Fréquence»",
    "button .in-data-[field-density=comfortable]:data-[size=default]:h-controle-confortable plancher-tactile-10 flex items-center justify-between gap-1.5 rounded-lg border border-input bg-fond-champ py-2 pr-2.5 pl-3 text-declencheur whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground h-controle data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 w-full type=button role=combobox",
    "span .flex flex-1 text-left «Mois»",
    "svg .lucide lucide-chevron-down pointer-events-none size-4 text-muted-foreground «▼»",
    "path .",
    "input .",
    "fieldset .space-y-3 pt-1",
    "legend .text-sm font-medium text-foreground «Coût d’entrée»",
    "p .text-xs text-muted-foreground «Ce que le locataire verse pour emménager. Laissez vide ce qui ne s'applique pas.»",
    "div .grid gap-4 sm:grid-cols-2",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Mois d’avance»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 type=number name=advance_months inputmode=numeric min=0 max=24 step=1",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Mois de caution»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 type=number name=deposit_months inputmode=numeric min=0 max=24 step=1",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Charges mensuelles»",
    "div .",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 tabular-nums type=text name=monthly_charges inputmode=numeric placeholder=10 000"
  ],
  "localisation": [
    "header .",
    "h2 .text-base font-semibold text-foreground «Localisation»",
    "p .text-xs text-muted-foreground «La ville est obligatoire. Cliquez sur la carte pour placer le marqueur GPS.»",
    "div .grid gap-4 md:grid-cols-3",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Région»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Choisir une région",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Ville»",
    "span .ml-0.5 text-destructive «*»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Rechercher une ville",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Quartier»",
    "div .relative flex items-center role=group",
    "input .h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm role=combobox placeholder=Rechercher ou saisir un quartier",
    "div .pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground",
    "svg .lucide lucide-chevron-down size-4",
    "path .",
    "input .",
    "p .mt-1 text-[0.6875rem] text-muted-foreground «Régions, villes et quartiers : © les contributeurs d’OpenStreetMap (ODbL)»",
    "div .grid gap-4 md:grid-cols-3",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Rue / adresse»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=street placeholder=12 Rue des Jacarandas",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Code postal»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=postal_code placeholder=10700",
    "div .w-full",
    "label .mb-1.5 block text-sm font-medium «Pays (code ISO)»",
    "div .relative",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 name=country placeholder=SN maxlength=2",
    "div .space-y-3",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Coller un lien ou une position»",
    "div .flex flex-col gap-2 sm:flex-row",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 placeholder=Lien Google Maps, position WhatsApp, Plus Code ou coordonnées",
    "button .inline-flex items-center justify-center rounded-lg border bg-clip-padding text-bouton font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:scale-[0.96] motion-reduce:active:not-aria-[haspopup]:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-fond-contour hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-controle gap-1.5 px-3.5 plancher-tactile-10 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 min-h-11 shrink-0 type=button «Placer sur la carte»",
    "svg .lucide lucide-map-pin",
    "path .",
    "circle .",
    "div .grid grid-cols-2 gap-3",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Latitude»",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 type=number name=latitude inputmode=decimal step=any",
    "div .",
    "label .mb-1.5 block text-sm font-medium «Longitude»",
    "input .in-data-[field-density=comfortable]:h-controle-confortable h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 min-h-11 type=number name=longitude inputmode=decimal step=any",
    "div . data-testid=location-picker-map",
    "p .text-xs text-muted-foreground «Cliquez sur la carte ou faites glisser le marqueur pour ajuster la position.»"
  ]
};

const ATTENDU_DEPOT = [
  "div .",
  "label .flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60 has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring",
  "svg .lucide lucide-cloud-upload size-6 text-primary",
  "path .",
  "path .",
  "path .",
  "p .text-sm font-medium text-foreground «Glissez-déposez vos photos ici»",
  "p .text-xs text-pretty «ou cliquez — 10.00 Mo max, jusqu'à 3 fichiers.»",
  "input .sr-only type=file data-testid=media-dropzone-input accept=image/jpeg,image/png,image/webp multiple=",
  "label .mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring pointer-fine:hidden «Prendre une photo»",
  "svg .lucide lucide-camera size-4 text-primary",
  "path .",
  "circle .",
  "input .sr-only type=file accept=image/jpeg,image/png,image/webp capture=environment",
  "ul .mt-3 grid grid-cols-2 gap-2 md:grid-cols-4",
  "li .group relative overflow-hidden rounded-lg bg-muted p-2 text-xs",
  "span .block truncate text-foreground «salon.jpg»",
  "span .block text-muted-foreground «0.00 Mo»",
  "button .absolute right-1 top-1 rounded-full bg-background/70 p-1.5 text-foreground transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none type=button aria-label=Retirer salon.jpg",
  "svg .lucide lucide-x size-3",
  "path .",
  "path .",
  "li .group relative overflow-hidden rounded-lg bg-muted p-2 text-xs",
  "span .block truncate text-foreground «cuisine.png»",
  "span .block text-muted-foreground «0.00 Mo»",
  "button .absolute right-1 top-1 rounded-full bg-background/70 p-1.5 text-foreground transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none type=button aria-label=Retirer cuisine.png",
  "svg .lucide lucide-x size-3",
  "path .",
  "path ."
];

const ATTENDU_REFUS = "Maximum 3 fichiers.";

describe('TCK-2819 (lot 2) — la page d’édition d’un bien est inchangée', () => {
  it('un bien d’agence complet : même structure qu’avant le lot', () => {
    expect(empreinte(rendre(bienComplet('agency')))).toEqual(ATTENDU_AGENCE);
  });

  it('un bien d’indépendant : sans frais d’agence, la valeur lue est retirée (1 champ modifié), comme avant', async () => {
    const form = rendre(bienComplet('individual'));
    await waitFor(() => expect(form.querySelector('[aria-live="polite"]')?.textContent).toMatch(/1 champ modifié/));
    expect(empreinte(form)).toEqual(ATTENDU_INDEPENDANT);
  });
});

describe('TCK-2819 (lot 2) — MediaDropzone, réécrit sur useDepotDeFichiers, est inchangé', () => {
  it('rend la même zone, la même liste, et refuse au-delà du plafond comme avant', async () => {
    const fichiers = [new File(['a'], 'salon.jpg', { type: 'image/jpeg' }), new File(['b'], 'cuisine.png', { type: 'image/png' })];
    const onChange = vi.fn();
    const { container } = render(
      avecIntl(<MediaDropzone files={fichiers} onChange={onChange} onRemove={vi.fn()} maxFiles={3} camera />),
    );
    expect(elements(container)).toEqual(ATTENDU_DEPOT);
    const trop = [new File(['c'], 'a.jpg', { type: 'image/jpeg' }), new File(['d'], 'b.jpg', { type: 'image/jpeg' })];
    fireEvent.change(screen.getByTestId('media-dropzone-input'), { target: { files: trop } });
    expect(texte((await screen.findByRole('alert')).textContent ?? '')).toBe(ATTENDU_REFUS);
    expect(onChange).not.toHaveBeenCalled();
  });
});
