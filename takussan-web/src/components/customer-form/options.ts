import type { FormSelectOption } from '@/components/forms/FormSelect';
import {
  customerStatusValues,
  idTypeValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';

/**
 * Customer (CRM) enum labels — TCK-042.
 */

export const CUSTOMER_STATUS_LABELS: Record<
  (typeof customerStatusValues)[number],
  string
> = {
  active: 'Actif',
  inactive: 'Inactif',
  blocked: 'Bloqué',
  deleted: 'Archivé',
};

export const PIPELINE_STAGE_LABELS: Record<
  (typeof pipelineStageValues)[number],
  string
> = {
  lead: 'Lead',
  prospect: 'Prospect',
  qualified: 'Qualifié',
  negotiating: 'Négociation',
  converted: 'Converti',
  lost: 'Perdu',
};

export const ID_TYPE_LABELS: Record<(typeof idTypeValues)[number], string> = {
  id_card: 'Carte d’identité',
  passport: 'Passeport',
  driving_license: 'Permis de conduire',
};

function toOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): FormSelectOption[] {
  return values.map((v) => ({ value: v, label: labels[v] }));
}

export const CUSTOMER_STATUS_OPTIONS = toOptions(
  customerStatusValues,
  CUSTOMER_STATUS_LABELS,
);
export const PIPELINE_STAGE_OPTIONS = toOptions(
  pipelineStageValues,
  PIPELINE_STAGE_LABELS,
);
export const ID_TYPE_OPTIONS = toOptions(idTypeValues, ID_TYPE_LABELS);
