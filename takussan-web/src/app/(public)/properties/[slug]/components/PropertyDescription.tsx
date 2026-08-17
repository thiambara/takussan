'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

const COLLAPSED_LIMIT = 400;

export function PropertyDescription({ description }: { description: string | null }) {
  const t = useTranslations('property.detail');
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const needsToggle = description.length > COLLAPSED_LIMIT;
  const visible = needsToggle && !expanded ? `${description.slice(0, COLLAPSED_LIMIT).trimEnd()}…` : description;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-stone-900">{t('description')}</h2>
      <p className="text-stone-700 leading-relaxed whitespace-pre-line">{visible}</p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900 transition-colors"
        >
          {expanded ? t('collapse') : t('readMore')}
        </button>
      )}
    </section>
  );
}
