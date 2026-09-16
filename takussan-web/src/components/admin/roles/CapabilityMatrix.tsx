'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CapabilityCatalogue, CapabilityValue } from '@/types/agency-role';

const ANNEAU = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
        <p className="text-sm text-muted-foreground" data-testid="capability-matrix-count">
          {t('matrix.selected', { count: grantedCount, total: grantable.length })}
        </p>
        {readOnly ? null : (
          <div className="flex gap-2">
            {/* Primitive `Button` : les deux boutons faits main mesuraient 24 px de haut. L'anneau
                PLEIN est repris (TCK-371) : celui de la primitive est à 50 %, mesuré à 2,12:1. */}
            <Button type="button" variant="outline" size="sm" className={ANNEAU} onClick={() => onChange([...grantable])}>
              {t('matrix.select_all')}
            </Button>
            <Button type="button" variant="outline" size="sm" className={ANNEAU} onClick={() => onChange([])}>
              {t('matrix.clear')}
            </Button>
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
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleDomain(group.domain)}
                aria-expanded={!isCollapsed}
                aria-label={t('matrix.toggle_domain', { domain: domainLabel(group.domain) })}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-semibold text-foreground">{domainLabel(group.domain)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
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
                          // ⚠ Plus d'`opacity-60` sur la ligne : en lecture seule (rôle système),
                          // c'est TOUTE la matrice qui passait à 60 %, et le code de capacité
                          // (`text-muted-foreground`) tombait sous 4,5:1. La case désactivée dit
                          // déjà l'état ; le texte d'une capacité réservée passe en encre atténuée.
                          // `flex-wrap` : à 360 px la pastille « Réservé à la plateforme » sortait
                          // de la carte.
                          className={cn(
                            'flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm',
                            isReserved
                              ? 'cursor-not-allowed'
                              : readOnly
                                ? 'cursor-default'
                                : 'cursor-pointer transition-colors hover:bg-muted/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                            checked={isChecked}
                            disabled={isReserved || readOnly}
                            onChange={() => toggle(capability)}
                          />
                          <span className="min-w-0 flex-1 basis-40">
                            <span
                              className={cn(
                                'block',
                                isReserved ? 'text-muted-foreground' : 'text-foreground',
                              )}
                            >
                              {label(capability)}
                            </span>
                            <code className="block break-all text-xs text-muted-foreground">{capability}</code>
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
