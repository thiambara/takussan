'use client';

import {
  BedSingle,
  Briefcase,
  Building2,
  DoorOpen,
  Ellipsis,
  Tag,
  KeyRound,
  Factory,
  Hotel,
  House,
  HousePlus,
  LandPlot,
  type LucideIcon,
  MapPin,
  SquareParking,
  Store,
  TreePalm,
  Warehouse,
  Wheat,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import type { PropertyFormValues } from '@/lib/schemas/property';
import { contractTypeValues, propertyTypeValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';

/**
 * Un repère de FORME par type : il accélère le balayage d'une grille de 16.
 *
 * Des icônes Lucide et non plus des emojis (design-guidelines : « Lucide React uniquement ») —
 * l'emoji se dessinait différemment sur chaque système (Android, iOS, Windows), en couleurs
 * étrangères à la palette, et ne suivait pas l'état actif de la pastille. Une icône en
 * `currentColor` passe au clair sur la pastille retenue avec son libellé.
 */
const ICONES: Partial<Record<(typeof propertyTypeValues)[number], LucideIcon>> = {
  land: LandPlot, house: House, apartment: Building2, villa: HousePlus, studio: BedSingle,
  room: DoorOpen, office: Briefcase, shop: Store, warehouse: Warehouse, factory: Factory,
  farm: Wheat, hotel: Hotel, resort: TreePalm, garage: Wrench, parking: SquareParking,
  other: MapPin,
};

function iconeDe(type: (typeof propertyTypeValues)[number]) {
  const Icone = ICONES[type];
  return Icone ? <Icone className="size-6" strokeWidth={1.75} /> : undefined;
}

type TypeDeBien = (typeof propertyTypeValues)[number];

/**
 * TCK-631 — les neuf types qu'on publie le plus souvent, montrés d'emblée en tuiles ; les sept
 * autres attendent derrière « Plus de types ». Seize tuiles de même poids, c'était Appartement et
 * Terrain noyés entre Usine et Complexe.
 *
 * ⚠ L'ordre est celui de l'écran, pas celui de l'enum : on lit d'abord ce qu'on habite.
 */
const TYPES_COURANTS: readonly TypeDeBien[] = [
  'apartment', 'house', 'villa', 'studio', 'room', 'land', 'office', 'shop', 'warehouse',
];
const AUTRES_TYPES: readonly TypeDeBien[] = propertyTypeValues.filter(
  (v) => !TYPES_COURANTS.includes(v),
);

/** Louer d'abord : c'est le cas le plus fréquent, et l'ordre de l'enum n'a rien à dire à l'écran. */
const CONTRATS: readonly (typeof contractTypeValues)[number][] = ['rent', 'sale'];
const ICONES_CONTRAT = { rent: KeyRound, sale: Tag } as const;

/**
 * TCK-464 — la première étape : le contrat et le type de bien.
 *
 * Ces deux réponses gouvernent tout le reste du parcours (cf. `field-matrix.ts`) : elles se
 * montrent au lieu de se dérouler.
 *
 * TCK-631 (piste 6) — le contrat passe EN PREMIER, en deux grandes cartes : c'est la question qui
 * décide de tout, et elle venait en second, plus légère que les types. Les types suivent en
 * tuiles, neuf d'emblée, les sept autres sur demande.
 *
 * ⚠ Le vocabulaire du contrat est celui du PARCOURS (`PROPERTY_ENUM_NAMESPACES.contractTypeWizard`
 * → « Vendre » / « Louer »), pas celui de l'enum (`PROPERTY_ENUM_NAMESPACES.contractType` →
 * « Vente » / « Location »). C'est une question posée à quelqu'un — « qu'est-ce que vous voulez en
 * faire ? » — et un verbe y répond mieux qu'un substantif. Même motif que les deux vocabulaires de
 * `visibility` déjà documentés dans `../../options.ts` : le mot varie avec l'écran, la valeur ne
 * varie pas. Les DEUX sont adressés par la table — jamais une chaîne recopiée à la main ici.
 *
 * ⚠ `type` et `contrat` sont chacun un choix à sélection UNIQUE, non désélectionnable : la
 * sémantique ARIA est donc un groupe de radios (`radioGroup`), quelle que soit la forme (`cartes`,
 * `tuiles`). « Plus de types » est HORS du groupe : ce n'est pas une réponse, c'est un repli.
 *
 * ⚠ Un type retenu parmi les sept repliés (brouillon repris sur « Ferme ») DÉPLIE le groupe : une
 * réponse donnée qu'on ne voit plus allumée se relirait comme une réponse absente.
 */
export function StepBien({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContrat = useTranslations(PROPERTY_ENUM_NAMESPACES.contractTypeWizard);
  const { control, setValue } = form;
  // TCK-564 — `useWatch`, JAMAIS `watch()` lu pendant le rendu. Avec `watch('type')`, le React
  // Compiler mettait la valeur en cache sur l'identité — stable — de `watch` : la pastille
  // cliquée ne s'allumait jamais, EN PRODUCTION SEULEMENT (vitest ne compile pas). Mesure et
  // garde : `__tests__/abonnement-des-etapes.test.tsx`.
  const [type, contrat] = useWatch({ control, name: ['type', 'contract_type'] });
  const [plusDeTypes, setPlusDeTypes] = useState(false);
  const typeReplie = type !== undefined && AUTRES_TYPES.includes(type);
  const deplie = plusDeTypes || typeReplie;
  const typesMontres = deplie ? [...TYPES_COURANTS, ...AUTRES_TYPES] : TYPES_COURANTS;

  return (
    <>
      <ChoiceChips
        id="wizard-contract"
        label={t('fields.contract')}
        radioGroup
        variant="cartes"
        value={contrat}
        onChange={(v) =>
          setValue('contract_type', v as PropertyFormValues['contract_type'], { shouldDirty: true })
        }
        options={CONTRATS.map((v) => {
          const Icone = ICONES_CONTRAT[v];
          return {
            value: v,
            label: tContrat(v),
            description: t(`contractHint.${v}`),
            icon: <Icone className="size-5" strokeWidth={1.75} />,
          };
        })}
      />
      <div>
        <ChoiceChips
          id="wizard-type"
          label={t('fields.type')}
          radioGroup
          variant="tuiles"
          value={type}
          onChange={(v) => setValue('type', v as PropertyFormValues['type'], { shouldDirty: true })}
          options={typesMontres.map((v) => ({ value: v, label: tType(v), icon: iconeDe(v) }))}
        />
        {/* Replier est interdit tant que la réponse retenue vit dans le repli. */}
        {typeReplie ? null : (
          <button
            type="button"
            aria-expanded={deplie}
            onClick={() => setPlusDeTypes((v) => !v)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Ellipsis className="size-4" aria-hidden="true" />
            {deplie ? t('fewerTypes') : t('moreTypes', { count: AUTRES_TYPES.length })}
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t('geoDefaultsNote')}</p>
    </>
  );
}
