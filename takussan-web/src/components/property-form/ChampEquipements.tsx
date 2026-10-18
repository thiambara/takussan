'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { ComboboxMultiple, replierPourIdentite, type OptionDeListe } from '@/components/ui/combobox';
import { ESPACE_DU_CATALOGUE, libelleEquipement } from '@/lib/libelle-equipement';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';

/** Le préfixe d'une valeur qui n'est PAS un identifiant : un nom saisi, à proposer (`tag_names`). */
const NOM = 'nom:';

/**
 * TCK-633 (AC10) — les équipements en multi-sélection avec puces.
 *
 * Deux sources de valeurs, deux clés du formulaire : un équipement du catalogue part dans
 * `tag_ids` ; un nom tapé que le catalogue ne connaît pas part dans `tag_names`, et le serveur en
 * fait une proposition (`TagProposals`, tâche 11) — affichée telle que saisie, « en attente ».
 *
 * Le catalogue est celui que l'API sert à l'utilisateur : les équipements approuvés, plus SES
 * propositions en attente (`TagController::index`, tâche 10). `attaches` complète les libellés
 * des équipements déjà portés par le bien et absents du catalogue (proposés par quelqu'un d'autre).
 *
 * Le champ est rendu même sans catalogue : on peut toujours ajouter.
 *
 * Un équipement du catalogue s'affiche dans la langue de l'écran (traduit par son slug) ; un
 * équipement saisi par un annonceur, tel quel (`libelleEquipement`). La recherche dans la liste
 * porte sur le libellé AFFICHÉ : un anglophone trouve « pool ».
 */
export function ChampEquipements({
  form,
  tags,
  attaches = [],
  label,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly tags: readonly Tag[];
  readonly attaches?: readonly Tag[];
  readonly label: string;
}) {
  const t = useTranslations('property.form.amenities');
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  const locale = useLocale();
  const { control, setValue } = form;
  const [idsSuivis, nomsSuivis] = useWatch({ control, name: ['tag_ids', 'tag_names'] });
  const ids = (idsSuivis ?? []) as number[];
  const noms = (nomsSuivis ?? []) as string[];

  const enOption = (tag: Tag): OptionDeListe => ({
    value: String(tag.id),
    label: libelleEquipement(tag, tCatalogue),
    indice: tag.status === 'pending' ? t('pending') : undefined,
  });
  const connus = new Map<number, Tag>();
  for (const tag of [...attaches, ...tags]) connus.set(tag.id, tag);

  // TCK-923 — triées sur le libellé AFFICHÉ : l'API ordonne par le nom français.
  const options = tags
    .filter((tag) => tag.status !== 'rejected')
    .map(enOption)
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const valeurs: OptionDeListe[] = [
    ...ids.flatMap((id) => {
      const tag = connus.get(id);
      return tag ? [enOption(tag)] : [];
    }),
    ...noms.map((nom) => ({ value: `${NOM}${nom}`, label: nom, indice: t('pending') })),
  ];

  const ecrire = (suivantes: readonly OptionDeListe[]) => {
    setValue(
      'tag_ids',
      suivantes.filter((o) => !o.value.startsWith(NOM)).map((o) => Number(o.value)),
      { shouldDirty: true },
    );
    setValue(
      'tag_names',
      suivantes.filter((o) => o.value.startsWith(NOM)).map((o) => o.label),
      { shouldDirty: true },
    );
  };

  return (
    <div className="w-full">
      <label htmlFor="champ-equipements" className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <ComboboxMultiple
        id="champ-equipements"
        options={options}
        valeurs={valeurs}
        onChange={ecrire}
        creation={{
          libelle: (nom) => t('create', { name: nom }),
          surCreation: (nom) => {
            // Un nom déjà retenu (à la casse près) ne se double pas.
            if (noms.some((n) => replierPourIdentite(n) === replierPourIdentite(nom))) return;
            setValue('tag_names', [...noms, nom], { shouldDirty: true });
          },
        }}
        retirer={(nom) => t('remove', { name: nom })}
        placeholder={t('placeholder')}
        aucunResultat={t('empty')}
      />
    </div>
  );
}
