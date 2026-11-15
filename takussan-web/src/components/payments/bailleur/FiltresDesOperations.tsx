'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { PAYMENT_STATUS_VALUES } from '../constants';

const TOUS = '__tous__';

export interface FiltresDesOperationsProps {
  /** Les biens du relevé (`properties[]`), nommés. */
  readonly biens: readonly { readonly id: number; readonly titre: string }[];
  /** Les locataires du relevé, par leur nom. */
  readonly locataires: readonly string[];
}

/**
 * TCK-2651 — les filtres du registre du BAILLEUR (onglet « Opérations » de « Loyers ») : statut, bien,
 * locataire, du / au. « Type d'entité » et « ID entité · Ex : 42 » (`PaymentsHistoryFilters`, celui du
 * personnel) disparaissent : le bien et le locataire se choisissent par leur NOM.
 *
 * - le bien filtre par `entity_type=property&entity_id=` : l'identifiant ne vit que dans l'adresse ;
 * - le locataire, par la recherche du registre (`search`), qui lit le nom du payeur côté serveur.
 *
 * Chaque choix s'écrit dans l'adresse (partageable) et ramène à la première page.
 */
export function FiltresDesOperations({ biens, locataires }: FiltresDesOperationsProps) {
  const t = useTranslations('payments.bailleur.filtres');
  const tFiltres = useTranslations('payments.history.filters');
  const tStatut = useTranslations('payments.status');
  const router = useRouter();
  const recherche = useSearchParams();

  const ecrire = (valeurs: Readonly<Record<string, string | null>>) => {
    const params = new URLSearchParams(recherche?.toString() ?? '');
    for (const [cle, valeur] of Object.entries(valeurs)) {
      if (valeur === null || valeur === '' || valeur === TOUS) params.delete(cle);
      else params.set(cle, valeur);
    }
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?');
  };

  const bienChoisi = recherche?.get('entity_type') === 'property' ? (recherche.get('entity_id') ?? TOUS) : TOUS;
  const statuts = PAYMENT_STATUS_VALUES.map((value) => ({ value, label: tStatut(value) }));

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5" data-slot="filtres-des-operations">
      <div>
        <Label htmlFor="operations-statut" className="mb-1.5 block text-xs font-medium">
          {tFiltres('status')}
        </Label>
        <Select
          value={recherche?.get('status') ?? TOUS}
          onValueChange={(v) => ecrire({ status: v as string | null })}
          items={[{ value: TOUS, label: tFiltres('allStatuses') }, ...statuts]}
        >
          <SelectTrigger id="operations-statut" className="w-full">
            <SelectValue placeholder={tFiltres('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOUS}>{tFiltres('allStatuses')}</SelectItem>
            {statuts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="operations-bien" className="mb-1.5 block text-xs font-medium">
          {t('bien')}
        </Label>
        <Select
          value={bienChoisi}
          onValueChange={(v) =>
            ecrire(v === TOUS || v === null ? { entity_type: null, entity_id: null } : { entity_type: 'property', entity_id: String(v) })
          }
          items={[{ value: TOUS, label: t('tousLesBiens') }, ...biens.map((b) => ({ value: String(b.id), label: b.titre }))]}
        >
          <SelectTrigger id="operations-bien" className="w-full">
            <SelectValue placeholder={t('tousLesBiens')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOUS}>{t('tousLesBiens')}</SelectItem>
            {biens.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.titre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="operations-locataire" className="mb-1.5 block text-xs font-medium">
          {t('locataire')}
        </Label>
        <Select
          value={recherche?.get('search') ?? TOUS}
          onValueChange={(v) => ecrire({ search: v as string | null })}
          items={[{ value: TOUS, label: t('tousLesLocataires') }, ...locataires.map((nom) => ({ value: nom, label: nom }))]}
        >
          <SelectTrigger id="operations-locataire" className="w-full">
            <SelectValue placeholder={t('tousLesLocataires')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOUS}>{t('tousLesLocataires')}</SelectItem>
            {locataires.map((nom) => (
              <SelectItem key={nom} value={nom}>
                {nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="operations-du" className="mb-1.5 block text-xs font-medium">
          {tFiltres('from')}
        </Label>
        <DatePicker id="operations-du" value={recherche?.get('date_from') ?? ''} onValueChange={(valeur) => ecrire({ date_from: valeur || null })} />
      </div>

      <div>
        <Label htmlFor="operations-au" className="mb-1.5 block text-xs font-medium">
          {tFiltres('to')}
        </Label>
        <DatePicker id="operations-au" value={recherche?.get('date_to') ?? ''} onValueChange={(valeur) => ecrire({ date_to: valeur || null })} />
      </div>
    </div>
  );
}
