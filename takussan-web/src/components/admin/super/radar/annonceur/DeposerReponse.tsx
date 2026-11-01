'use client';

import { useId, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CAPTURES_ACCEPT, refusCaptures, type RefusCaptures } from '../captures';

interface DeposerReponseProps {
  /** Rend `true` quand l'API a reçu la réponse : le choix de fichiers se vide alors. */
  readonly onDeposer: (fichiers: readonly File[]) => Promise<boolean>;
  readonly desactive: boolean;
  readonly enCours: boolean;
}

const CLE_REFUS: Record<RefusCaptures, string> = {
  tooMany: 'capturesTooMany',
  fileTooLarge: 'captureFileTooLarge',
  totalTooLarge: 'capturesTotalTooLarge',
};

/**
 * TCK-2388 — déposer la réponse d'un annonceur : les captures de la conversation WhatsApp. Les bornes de type, de
 * nombre et de poids sont celles de la saisie (`captures.ts`) et se jugent ICI, avant l'envoi : un refus se dit sans
 * avoir poussé 24 Mo pour rien.
 */
export function DeposerReponse({ onDeposer, desactive, enCours }: DeposerReponseProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.reply');
  const tErreurs = useTranslations('superAdmin.pages.radar.intake.errors');
  const champ = useId();
  const [fichiers, setFichiers] = useState<readonly File[]>([]);
  // Changer la clé remonte le champ : un <input type="file"> ne se vide pas par une valeur.
  const [generation, setGeneration] = useState(0);
  const refus = refusCaptures(fichiers);

  const choisir = (event: ChangeEvent<HTMLInputElement>) => {
    setFichiers(Array.from(event.target.files ?? []));
  };

  const envoyer = async () => {
    if (fichiers.length === 0 || refus !== null) return;
    if (await onDeposer(fichiers)) {
      setFichiers([]);
      setGeneration((g) => g + 1);
    }
  };

  return (
    <div className="space-y-2" data-testid="radar-reponse-deposer">
      <Label htmlFor={champ}>{t('depositLabel')}</Label>
      <input
        key={generation}
        id={champ}
        type="file"
        multiple
        accept={CAPTURES_ACCEPT}
        disabled={desactive || enCours}
        onChange={choisir}
        className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm"
        data-testid="radar-reponse-fichiers"
      />
      <p className="text-xs text-muted-foreground">{t('depositHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={desactive || enCours || fichiers.length === 0 || refus !== null} onClick={() => void envoyer()}>
          {enCours ? t('depositing') : t('deposit')}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">{t('selected', { count: fichiers.length })}</p>
      </div>
      {refus ? (
        <p role="alert" className="text-sm text-destructive" data-testid="radar-reponse-refus">{tErreurs(CLE_REFUS[refus])}</p>
      ) : null}
    </div>
  );
}
