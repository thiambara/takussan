import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Tag (admin) schemas — TCK-066.
 *
 * Source of truth : backend `TagController` fields → `name`, `type`,
 * `icon`, `color`, `description`. The slug is auto-generated on create
 * and not editable afterwards.
 */

import { tagTypeValues } from '@/lib/enums/tag';

/**
 * TCK-633 (ADR-0062 §7) — les types qu'un formulaire peut CRÉER. La liste vit dans
 * `@/lib/enums/tag`, sans zod (TCK-1196) : un écran qui ne fait que la lire n'a pas à charger ce
 * module.
 */
export { tagTypeValues };

export const tagFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msgValidation('tag.nameRequired'))
    .max(100, msgValidation('tag.nameTooLong')),
  type: z.enum(tagTypeValues),
  icon: z.string().trim().max(60, msgValidation('tag.iconTooLong')),
  color: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^#?[0-9a-fA-F]{3,8}$/.test(v),
      msgValidation('tag.colorInvalid'),
    ),
  description: z.string().trim().max(500, msgValidation('tag.descriptionTooLong')),
});

export type TagFormValues = z.infer<typeof tagFormSchema>;

export interface TagFormPayload {
  name: string;
  type: (typeof tagTypeValues)[number];
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
}

export function normaliseTagForm(values: TagFormValues): TagFormPayload {
  return {
    name: values.name.trim(),
    type: values.type,
    icon: emptyToNull(values.icon),
    color: emptyToNull(values.color),
    description: emptyToNull(values.description),
  };
}
