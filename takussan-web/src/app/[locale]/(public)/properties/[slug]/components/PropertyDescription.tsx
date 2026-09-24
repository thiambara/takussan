'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { LANGUE_DE_SAISIE_DES_ANNONCES } from './langue-de-saisie';

const COLLAPSED_LIMIT = 400;

export function PropertyDescription({ description }: { description: string | null }) {
  const t = useTranslations('property.detail');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const needsToggle = description.length > COLLAPSED_LIMIT;
  const visible = needsToggle && !expanded ? `${description.slice(0, COLLAPSED_LIMIT).trimEnd()}…` : description;

  // TCK-562 (M9) — le texte est celui de l'annonceur, pas de l'interface : il porte SA langue
  // (`lang`, pour qu'un lecteur d'écran ne prononce pas du français avec une voix anglaise), et
  // une mention la dit quand elle n'est pas celle de l'interface. Pas de traduction automatique.
  const langue = LANGUE_DE_SAISIE_DES_ANNONCES;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{t('description')}</h2>
      {langue !== locale && (
        // `bg-background` : le fond de la page, DÉCLARÉ, pour que la garde de contraste (TCK-458)
        // juge cette encre sur la surface où elle est posée au lieu de la ranger parmi ses trous.
        <p className="flex items-start gap-1.5 bg-background text-sm text-muted-foreground">
          {/* Aligné sur la PREMIÈRE ligne : la mention tient sur une ligne à 360 px en anglais comme
              en wolof (mesuré), mais un texte agrandi par le lecteur la fait passer à deux. */}
          <Languages className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('descriptionLanguageNotice', { langue })}
        </p>
      )}
      <p lang={langue} className="text-foreground leading-relaxed whitespace-pre-line">
        {visible}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          {expanded ? t('collapse') : t('readMore')}
        </button>
      )}
    </section>
  );
}
