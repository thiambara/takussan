'use client';

import { DepotDePhotos } from '../DepotDePhotos';

/**
 * TCK-464 — l'étape des photos, la seule qui se saute (`skippable`).
 *
 * Elle ne possède aucun champ du formulaire : les fichiers vivent dans l'état de l'assemblage,
 * qui seul sait les envoyer APRÈS la création du bien (l'envoi a besoin de l'id). L'erreur lui
 * est donc rendue en prop plutôt que devinée ici.
 *
 * TCK-2819 (lot 2) — le dépôt est celui de la maquette (`DepotDePhotos`) : tuiles au téléphone, zone
 * au bureau, vignettes et « Couverture ». Le compte « n photos sur 10 » y vit, au-dessus des vignettes.
 */
export function StepPhotos({
  files,
  onChange,
  onRemove,
  error,
}: {
  readonly files: File[];
  readonly onChange: (files: File[]) => void;
  readonly onRemove: (index: number) => void;
  readonly error: string | null;
}) {
  return <DepotDePhotos files={files} onChange={onChange} onRemove={onRemove} error={error} />;
}
