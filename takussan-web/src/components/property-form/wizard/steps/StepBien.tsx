'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import type { PropertyFormValues } from '@/lib/schemas/property';
import { contractTypeValues, propertyTypeValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';

/** Les emojis servent de repère de forme, pas de décor : ils accélèrent le balayage d'une grille de 16. */
const ICONES: Partial<Record<(typeof propertyTypeValues)[number], string>> = {
  land: '🌍', house: '🏠', apartment: '🏢', villa: '🏡', studio: '🛏', room: '🚪',
  office: '💼', shop: '🏪', warehouse: '📦', factory: '🏭', farm: '🌾', hotel: '🏨',
  resort: '🌴', garage: '🔧', parking: '🅿️', other: '📍',
};

/**
 * TCK-464 — la première étape : le type de bien et le contrat, tous deux en pastilles.
 *
 * Ces deux réponses gouvernent tout le reste du parcours (cf. `field-matrix.ts`) : elles passent
 * donc avant le titre, et se montrent au lieu de se dérouler.
 *
 * ⚠ Le vocabulaire du contrat est celui du PARCOURS (`property.wizard.contract` : « Vendre » /
 * « Louer »), pas celui de l'enum (`property.contractTypes` : « Vente » / « Location »). C'est
 * une question posée à quelqu'un — « qu'est-ce que vous voulez en faire ? » — et un verbe y
 * répond mieux qu'un substantif. Même motif que les deux vocabulaires de `visibility` déjà
 * documentés dans `../../options.ts` : le mot varie avec l'écran, la valeur ne varie pas.
 */
export function StepBien({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const { watch, setValue } = form;

  return (
    <>
      <ChoiceChips
        id="wizard-type"
        label={t('fields.type')}
        value={watch('type')}
        onChange={(v) => setValue('type', v as PropertyFormValues['type'], { shouldDirty: true })}
        options={propertyTypeValues.map((v) => ({ value: v, label: tType(v), icon: ICONES[v] }))}
      />
      <ChoiceChips
        id="wizard-contract"
        label={t('fields.contract')}
        value={watch('contract_type')}
        onChange={(v) =>
          setValue('contract_type', v as PropertyFormValues['contract_type'], { shouldDirty: true })
        }
        options={contractTypeValues.map((v) => ({ value: v, label: t(`contract.${v}`) }))}
      />
      <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t('geoDefaultsNote')}
      </p>
    </>
  );
}
