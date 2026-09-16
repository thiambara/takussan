'use client';

import {
  BedSingle,
  Briefcase,
  Building2,
  DoorOpen,
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
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

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
  return Icone ? <Icone className="size-4" strokeWidth={1.75} /> : undefined;
}

/**
 * TCK-464 — la première étape : le type de bien et le contrat, tous deux en pastilles.
 *
 * Ces deux réponses gouvernent tout le reste du parcours (cf. `field-matrix.ts`) : elles passent
 * donc avant le titre, et se montrent au lieu de se dérouler.
 *
 * ⚠ Le vocabulaire du contrat est celui du PARCOURS (`PROPERTY_ENUM_NAMESPACES.contractTypeWizard`
 * → « Vendre » / « Louer »), pas celui de l'enum (`PROPERTY_ENUM_NAMESPACES.contractType` →
 * « Vente » / « Location »). C'est une question posée à quelqu'un — « qu'est-ce que vous voulez en
 * faire ? » — et un verbe y répond mieux qu'un substantif. Même motif que les deux vocabulaires de
 * `visibility` déjà documentés dans `../../options.ts` : le mot varie avec l'écran, la valeur ne
 * varie pas. Les DEUX sont adressés par la table — jamais une chaîne recopiée à la main ici.
 *
 * ⚠ `type` et `contrat` sont chacun un choix à sélection UNIQUE, non désélectionnable : la
 * sémantique ARIA est donc un groupe de radios (`radioGroup`), pas le groupe de boutons-bascule
 * par défaut de `ChoiceChips` — celui-là reste réservé aux choix facultatifs ou multiples
 * (statut foncier, équipements, dans `StepCaracteristiques`).
 */
export function StepBien({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContrat = useTranslations(PROPERTY_ENUM_NAMESPACES.contractTypeWizard);
  const { watch, setValue } = form;

  return (
    <>
      <ChoiceChips
        id="wizard-type"
        label={t('fields.type')}
        radioGroup
        value={watch('type')}
        onChange={(v) => setValue('type', v as PropertyFormValues['type'], { shouldDirty: true })}
        options={propertyTypeValues.map((v) => ({ value: v, label: tType(v), icon: iconeDe(v) }))}
      />
      <ChoiceChips
        id="wizard-contract"
        label={t('fields.contract')}
        radioGroup
        value={watch('contract_type')}
        onChange={(v) =>
          setValue('contract_type', v as PropertyFormValues['contract_type'], { shouldDirty: true })
        }
        options={contractTypeValues.map((v) => ({ value: v, label: tContrat(v) }))}
      />
      <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t('geoDefaultsNote')}
      </p>
    </>
  );
}
