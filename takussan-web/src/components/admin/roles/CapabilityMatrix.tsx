'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CapabilityCatalogue, CapabilityValue } from '@/types/agency-role';

interface CapabilityMatrixProps {
  readonly catalogue: CapabilityCatalogue;
  /** Capacités actuellement cochées. */
  readonly value: readonly CapabilityValue[];
  readonly onChange: (next: CapabilityValue[]) => void;
  /** Rôle système : tout est visible, rien n'est modifiable. */
  readonly readOnly?: boolean;
}

/**
 * TCK-279 — matrice de capacités, sections repliables par domaine.
 *
 * ## Les réservées plateforme sont GRISÉES, pas masquées
 *
 * `GET /api/capabilities` publie `platform_reserved` à côté de `domains`.
 * L'API refuse ces valeurs en 422 (`Capability::platformReserved()`), donc
 * une case cochable qui rend 422 serait un défaut d'UI, pas une garde.
 *
 * Les masquer aurait été plus simple et plus faux : `properties.moderate`
 * existe, un administrateur d'agence peut légitimement se demander pourquoi
 * il ne l'a pas, et une ligne absente ne répond pas à cette question. Une
 * ligne désactivée avec son motif y répond.
 *
 * ## Cases natives, pas de primitive
 *
 * `<input type="checkbox">` plutôt qu'un composant : il n'existe pas de
 * primitive `checkbox` dans `src/components/ui/` (20 fichiers, vérifié), et
 * en introduire une pour cet écran serait une décision de design system prise
 * en passant. Le natif porte déjà l'état indéterminé, le clavier et le nom
 * accessible.
 */
export function CapabilityMatrix({
  catalogue,
  value,
  onChange,
  readOnly = false,
}: CapabilityMatrixProps) {
  const t = useTranslations('admin.roles');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const reserved = useMemo(
    () => new Set(catalogue.platform_reserved),
    [catalogue.platform_reserved],
  );
  const selected = useMemo(() => new Set(value), [value]);

  /**
   * Total sur lequel se compte « x sur y » : les réservées plateforme en
   * sont exclues. Les compter ferait plafonner l'indicateur à 42/44 pour un
   * rôle qui a pourtant TOUT ce qu'il peut avoir — un « incomplet » qui n'a
   * aucun geste pour être résolu.
   */
  const grantable = useMemo(
    () =>
      catalogue.domains.flatMap((d) => d.capabilities).filter((c) => !reserved.has(c)),
    [catalogue.domains, reserved],
  );

  const toggle = (capability: CapabilityValue) => {
    if (readOnly || reserved.has(capability)) return;
    const next = new Set(selected);
    if (next.has(capability)) next.delete(capability);
    else next.add(capability);
    onChange([...next]);
  };

  const toggleDomain = (domain: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const label = (capability: CapabilityValue): string => {
    const key = `capabilities.${capability}`;
    return t.has(key) ? t(key) : capability;
  };

  const domainLabel = (domain: string): string => {
    const key = `domains.${domain}`;
    return t.has(key) ? t(key) : domain;
  };

  const grantedCount = grantable.filter((c) => selected.has(c)).length;

  return (
    <div className="space-y-3" data-testid="capability-matrix">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-ink-muted" data-testid="capability-matrix-count">
          {t('matrix.selected', { count: grantedCount, total: grantable.length })}
        </p>
        {readOnly ? null : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange([...grantable])}
              className="rounded-md border border-input px-2.5 py-1 text-xs text-app-ink transition-colors hover:bg-app-surface-2"
            >
              {t('matrix.select_all')}
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded-md border border-input px-2.5 py-1 text-xs text-app-ink transition-colors hover:bg-app-surface-2"
            >
              {t('matrix.clear')}
            </button>
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {catalogue.domains.map((group) => {
          const isCollapsed = collapsed.has(group.domain);
          const domainGrantable = group.capabilities.filter((c) => !reserved.has(c));
          const domainGranted = domainGrantable.filter((c) => selected.has(c)).length;

          return (
            <li
              key={group.domain}
              className="overflow-hidden rounded-xl border border-border bg-app-surface-1"
            >
              <button
                type="button"
                onClick={() => toggleDomain(group.domain)}
                aria-expanded={!isCollapsed}
                aria-label={t('matrix.toggle_domain', { domain: domainLabel(group.domain) })}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-app-surface-2/50"
              >
                <span className="font-semibold text-app-ink">{domainLabel(group.domain)}</span>
                <span className="flex items-center gap-2 text-xs text-app-ink-muted">
                  {t('matrix.domain_selected', {
                    count: domainGranted,
                    total: domainGrantable.length,
                  })}
                  <ChevronDown
                    className={cn('size-4 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </span>
              </button>

              {isCollapsed ? null : (
                <ul className="border-t border-border">
                  {group.capabilities.map((capability) => {
                    const isReserved = reserved.has(capability);
                    const isChecked = selected.has(capability);
                    return (
                      <li key={capability} className="border-b border-border/50 last:border-b-0">
                        <label
                          className={cn(
                            'flex items-start gap-3 px-4 py-2.5 text-sm',
                            isReserved || readOnly
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:bg-app-surface-2/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-primary"
                            checked={isChecked}
                            disabled={isReserved || readOnly}
                            onChange={() => toggle(capability)}
                          />
                          <span className="flex-1">
                            <span className="block text-app-ink">{label(capability)}</span>
                            <code className="block text-xs text-app-ink-muted">{capability}</code>
                          </span>
                          {isReserved ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1"
                              title={t('matrix.platform_reserved_hint')}
                            >
                              <Lock className="size-3" aria-hidden="true" />
                              {t('matrix.platform_reserved')}
                            </Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
