'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, CircleDashed, Lock } from 'lucide-react';

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
 * ## Les capacités sans effet ne sont PLUS cochables (TCK-2676, revient sur TCK-587)
 *
 * `not_enforced` liste les capacités qu'aucun geste ne juge encore
 * (`CapabilityEnforcementInventory`). TCK-587 les laissait cochables et comptées : un rôle
 * plafonnait à « 46 sur 46 » en portant des cases qui ne faisaient rien. Elles passent en bas
 * de leur domaine, case désactivée, leur raison écrite à côté, hors des comptes et des deux
 * raccourcis. Aucun droit ne change pour autant : une capacité sans effet déjà accordée reste
 * dans la valeur émise — « Tout cocher » et « Tout décocher » la conservent telle quelle.
 *
 * ## Le libellé, jamais le code (TCK-2676)
 *
 * Le code `<domaine>.<verbe>` n'est plus écrit sous le libellé : il vit dans le `title` de la
 * ligne et de la case (infobulle au survol, description accessible au lecteur d'écran), pour le
 * support. Une capacité que le dictionnaire ne connaît pas encore se lit « Autre capacité »,
 * son code au survol — jamais brute à l'écran.
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
  const notEnforced = useMemo(
    () => new Set((catalogue.not_enforced ?? []).map((row) => row.capability)),
    [catalogue.not_enforced],
  );
  const selected = useMemo(() => new Set(value), [value]);

  /**
   * Total sur lequel se compte « x sur y » : les réservées plateforme en
   * sont exclues. Les compter ferait plafonner l'indicateur à 42/44 pour un
   * rôle qui a pourtant TOUT ce qu'il peut avoir — un « incomplet » qui n'a
   * aucun geste pour être résolu. TCK-2676 : les sans effet aussi — le compte ne
   * dit plus que ce qui agit.
   */
  const attribuable = (c: CapabilityValue) => !reserved.has(c) && !notEnforced.has(c);
  const grantable = catalogue.domains.flatMap((d) => d.capabilities).filter(attribuable);
  /** Les capacités sans effet déjà accordées : aucun raccourci ne les retire ni ne les ajoute. */
  const conservees = value.filter((c) => notEnforced.has(c) && !reserved.has(c));

  const toggle = (capability: CapabilityValue) => {
    if (readOnly || !attribuable(capability)) return;
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
    return t.has(key) ? t(key) : t('matrix.unknown_capability');
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
            <Button type="button" variant="outline" size="sm" className={ANNEAU} onClick={() => onChange([...conservees, ...grantable])}>
              {t('matrix.select_all')}
            </Button>
            <Button type="button" variant="outline" size="sm" className={ANNEAU} onClick={() => onChange([...conservees])}>
              {t('matrix.clear')}
            </Button>
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {catalogue.domains.map((group) => {
          const isCollapsed = collapsed.has(group.domain);
          const domainGrantable = group.capabilities.filter(attribuable);
          const domainGranted = domainGrantable.filter((c) => selected.has(c)).length;
          // Les sans effet en bas de leur domaine ; l'ordre du catalogue est gardé de part et d'autre.
          const ordonnees = [
            ...group.capabilities.filter((c) => !notEnforced.has(c) || reserved.has(c)),
            ...group.capabilities.filter((c) => notEnforced.has(c) && !reserved.has(c)),
          ];

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
                  {/* Un domaine sans aucune capacité attribuable (messagerie) ne lit pas « 0/0 ». */}
                  {domainGrantable.length > 0
                    ? t('matrix.domain_selected', {
                      count: domainGranted,
                      total: domainGrantable.length,
                    })
                    : t('matrix.not_enforced')}
                  <ChevronDown
                    className={cn('size-4 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </span>
              </button>

              {isCollapsed ? null : (
                <ul className="border-t border-border">
                  {ordonnees.map((capability) => {
                    const isReserved = reserved.has(capability);
                    const isNotEnforced = !isReserved && notEnforced.has(capability);
                    const isChecked = selected.has(capability);
                    return (
                      <li key={capability} className="border-b border-border/50 last:border-b-0">
                        <label
                          title={capability}
                          data-capability={capability}
                          // ⚠ Plus d'`opacity-60` sur la ligne : en lecture seule (rôle système),
                          // c'est TOUTE la matrice qui passait à 60 %, et le code de capacité
                          // (`text-muted-foreground`) tombait sous 4,5:1. La case désactivée dit
                          // déjà l'état ; le texte d'une capacité réservée passe en encre atténuée.
                          // `flex-wrap` : à 360 px la pastille « Réservé à la plateforme » sortait
                          // de la carte.
                          className={cn(
                            'flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm',
                            isReserved || isNotEnforced
                              ? 'cursor-not-allowed'
                              : readOnly
                                ? 'cursor-default'
                                : 'cursor-pointer transition-colors hover:bg-muted/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                            title={capability}
                            checked={isChecked}
                            disabled={isReserved || isNotEnforced || readOnly}
                            onChange={() => toggle(capability)}
                          />
                          <span className="min-w-0 flex-1 basis-40">
                            <span
                              className={cn(
                                'block',
                                isReserved || isNotEnforced ? 'text-muted-foreground' : 'text-foreground',
                              )}
                            >
                              {label(capability)}
                            </span>
                            {isNotEnforced ? (
                              <span
                                className="block text-xs text-muted-foreground"
                                data-testid={`capability-not-enforced-reason-${capability}`}
                              >
                                {t('matrix.not_enforced_reason')}
                              </span>
                            ) : null}
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
                          {isNotEnforced ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1"
                              data-testid={`capability-not-enforced-${capability}`}
                            >
                              <CircleDashed className="size-3" aria-hidden="true" />
                              {t('matrix.not_enforced')}
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
