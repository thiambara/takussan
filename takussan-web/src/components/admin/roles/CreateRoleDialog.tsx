'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAgencyRole } from '@/lib/queries/agency-roles';
import { ASSIGNABLE_BASE_TYPES } from '@/types/agency-role';
import type { AgencyRole, AgencyRoleBaseType } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface CreateRoleDialogProps {
  readonly agencyId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Rôles de l'agence — source des options de clonage. */
  readonly roles: readonly AgencyRole[];
  /** Rôle pré-sélectionné comme source, quand on arrive par « Cloner ». */
  readonly cloneFrom: AgencyRole | null;
  readonly onCreated: (role: AgencyRole) => void;
}

/**
 * TCK-279 (AC3 / AC11) — création d'un rôle, éventuellement par clonage.
 *
 * ## `<select>` natif, et pas la primitive `Select`
 *
 * Le choix du type de profil pilote la liste des sources de clonage : l'API
 * refuse un `clone_from` d'un autre `base_profile_type`. Un contrôle natif
 * porte cette dépendance sans le portail ni la machine à états de base-ui,
 * et reste pilotable au clavier comme par un test. Le reste de l'écran
 * emploie la primitive là où elle est autonome.
 *
 * ## `service_provider` n'est pas proposé
 *
 * `ASSIGNABLE_BASE_TYPES` l'exclut : `service_provider_profiles` ne porte
 * pas de `agency_role_id` (le profil est user-scopé et collabore avec N
 * agences). Un rôle qu'on ne peut assigner à personne serait une promesse
 * vide — la question est ouverte et ticketée à part (TCK-315).
 */
export function CreateRoleDialog({
  agencyId,
  open,
  onOpenChange,
  roles,
  cloneFrom,
  onCreated,
}: CreateRoleDialogProps) {
  const t = useTranslations('admin.roles');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const create = useCreateAgencyRole(agencyId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseType, setBaseType] = useState<AgencyRoleBaseType>(
    cloneFrom?.base_profile_type ?? 'agent',
  );
  const [cloneId, setCloneId] = useState<number | null>(cloneFrom?.id ?? null);

  /**
   * Le dialogue n'est pas démonté entre deux ouvertures : sans cette
   * réinitialisation, « Cloner » sur un second rôle rouvrirait le formulaire
   * rempli avec le premier.
   *
   * Ajusté pendant le rendu et non dans un effet : le formulaire ne doit
   * JAMAIS être peint avec les valeurs de l'ouverture précédente, fût-ce une
   * image. Le jeton compare la source, pas seulement `open` — deux clics
   * « Cloner » d'affilée sans fermeture intermédiaire changent `cloneFrom`
   * sans changer `open`.
   */
  const token = open ? `${cloneFrom?.id ?? 'new'}` : 'closed';
  // Initialisé à `'closed'` et NON à `token` : monté déjà ouvert, le
  // dialogue doit aussi se préremplir. Initialiser au jeton courant rendait
  // le premier rendu « déjà synchronisé » et laissait le formulaire vide —
  // invisible tant que le dialogue naît fermé, ce qui est le cas de
  // `AgencyRolesConsole`, mais faux pour tout autre appelant.
  const [syncedToken, setSyncedToken] = useState('closed');
  if (syncedToken !== token) {
    setSyncedToken(token);
    if (open) {
      // Le suffixe passe par next-intl : un gabarit interpolé est
      // précisément ce que `scripts/check-i18n.mjs` ne sait PAS voir (limite
      // documentée dans son en-tête), donc rien ne l'aurait signalé.
      setName(cloneFrom ? t('create.clone_name', { name: cloneFrom.name }) : '');
      setDescription('');
      setBaseType(cloneFrom?.base_profile_type ?? 'agent');
      setCloneId(cloneFrom?.id ?? null);
      create.reset();
    }
  }

  const clonableSources = roles.filter(
    (r) => r.base_profile_type === baseType && r.is_clonable,
  );

  const submit = async () => {
    const created = await create.mutateAsync({
      name: name.trim(),
      base_profile_type: baseType,
      description: description.trim() === '' ? null : description.trim(),
      clone_from: cloneId,
    });
    onOpenChange(false);
    onCreated(created.data);
  };

  const typeLabel = (type: AgencyRoleBaseType): string => {
    const key = `list.groups.${type}`;
    return t.has(key) ? t(key) : type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-role-name">{t('editor.name_label')}</Label>
            <Input
              id="create-role-name"
              value={name}
              placeholder={t('editor.name_placeholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-role-base-type">{t('create.base_type_label')}</Label>
            <select
              id="create-role-base-type"
              value={baseType}
              disabled={cloneFrom !== null}
              onChange={(e) => {
                setBaseType(e.target.value as AgencyRoleBaseType);
                setCloneId(null);
              }}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ASSIGNABLE_BASE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-role-clone-from">{t('create.clone_from_label')}</Label>
            <select
              id="create-role-clone-from"
              value={cloneId ?? ''}
              onChange={(e) => setCloneId(e.target.value === '' ? null : Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">{t('create.clone_from_none')}</option>
              {clonableSources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-role-description">{t('editor.description_label')}</Label>
            <Textarea
              id="create-role-description"
              rows={2}
              value={description}
              placeholder={t('editor.description_placeholder')}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {create.error ? (
            <p className="text-sm text-destructive" role="alert">
              {messageErreur(create.error)}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button disabled={create.isPending || name.trim() === ''} onClick={() => void submit()}>
            {create.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {create.isPending ? t('create.submitting') : t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
