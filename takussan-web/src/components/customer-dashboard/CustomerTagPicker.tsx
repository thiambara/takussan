'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { Tag as IconeEtiquette, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  attachCustomerTagsAction,
  detachCustomerTagAction,
} from '@/app/actions/dashboard-customers';
import { Input } from '@/components/ui/input';
import { ESPACE_DES_ETIQUETTES_CRM, libelleEquipement } from '@/lib/libelle-equipement';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types/tag';

/**
 * Deterministic color from tag name hash — cycles through a CRM-friendly palette.
 * The backend stores `color` only when manually overridden; for new tags we derive
 * it client-side so the same name always renders the same hue.
 *
 * Aplat à `/10` et non `/15` : c'est le plafond mesuré d'une pastille sémantique dont l'encre est
 * du texte (`docs/design-guidelines.md`, « L'aplat d'une pastille sémantique »).
 */
const PALETTE = [
  { bg: 'bg-info/10', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-info/10', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
  { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  { bg: 'bg-info/10', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
];

function tagColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type TagChip = Pick<Tag, 'id' | 'name' | 'slug' | 'color'>;

/**
 * TCK-922 (P30.06) — le libellé d'une étiquette à l'écran : une étiquette du catalogue CRM est
 * traduite par son slug, une étiquette saisie par l'agence s'affiche telle quelle. Le NOM en base
 * reste la valeur (filtre de la liste, couleur, rattachement).
 */
function useLibelleEtiquette() {
  const t = useTranslations(ESPACE_DES_ETIQUETTES_CRM);
  return (tag: Pick<Tag, 'name'> & { readonly slug?: string | null }) => libelleEquipement(tag, t);
}

interface Props {
  customerId: number;
  initialTags: TagChip[];
  /** Suggestions fetched server-side — top CRM tags for the agency */
  suggestions?: (Pick<Tag, 'id' | 'name' | 'color'> & { slug?: string | null })[];
  /** Deeplink: clicking a tag navigates to list filtered by that tag */
  onTagClick?: (tagName: string) => void;
  /**
   * TCK-2589 (maquette a-1, décision 3a) — `ligne` : au repos, une ligne « icône · pastilles ·
   * + Étiquette » (la carte du référent de la fiche client) ; « + Étiquette » ouvre le champ et les
   * pastilles retirables, « Terminé » (ou Échap) le referme. `champ` (défaut) : le champ toujours ouvert.
   */
  forme?: 'champ' | 'ligne';
}

export function CustomerTagPicker({
  customerId,
  initialTags,
  suggestions = [],
  onTagClick,
  forme = 'champ',
}: Props) {
  const t = useTranslations('crm.tags');
  const [ouvert, setOuvert] = useState(false);
  const libelle = useLibelleEtiquette();
  const [tags, setTags] = useState<TagChip[]>(initialTags);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const ajouter = useRef<HTMLButtonElement>(null);
  const idListe = useId();
  // La suggestion désignée au clavier (flèches) : -1, aucune — Entrée prend alors la saisie.
  const [actif, setActif] = useState(-1);
  /**
   * Où rendre le focus quand l'élément qui l'avait disparaît ou se désactive (contre-vérification de
   * TCK-2589 : il tombait sur `body`) : « + Étiquette » quand la ligne se referme, la pastille voisine
   * (ou le champ) quand une pastille est retirée, le champ après un ajout — le champ est désactivé
   * pendant l'envoi.
   */
  const rendreFocus = useRef<{ readonly vers: 'ajouter' | 'champ' } | { readonly vers: 'retirer'; readonly id: number; readonly voisin: number | null } | null>(null);

  // La forme « ligne » s'ouvre sur le geste « + Étiquette » : le curseur va au champ.
  useEffect(() => {
    if (forme === 'ligne' && ouvert) champ.current?.focus();
  }, [forme, ouvert]);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      input.trim().length > 0 &&
      libelle(s).toLowerCase().includes(input.toLowerCase().trim()) &&
      !tags.some((t) => t.name === s.name),
  );
  const listeOuverte = showSuggestions && filteredSuggestions.length > 0;
  const designee = listeOuverte && actif < filteredSuggestions.length ? actif : -1;

  useEffect(() => {
    const r = rendreFocus.current;
    if (!r || isPending) return;
    if (r.vers === 'ajouter') {
      if (ouvert) return;
      ajouter.current?.focus();
    } else if (r.vers === 'retirer') {
      const croix = (id: number) => containerRef.current?.querySelector<HTMLButtonElement>(`[data-retirer="${id}"]`) ?? null;
      // Refusé : la pastille est toujours là, sa croix reprend le focus ; retirée : la voisine, sinon le champ.
      (croix(r.id) ?? (r.voisin === null ? null : croix(r.voisin)) ?? champ.current)?.focus();
    } else {
      champ.current?.focus();
    }
    rendreFocus.current = null;
  }, [isPending, ouvert, tags]);

  const attach = useCallback(
    (name: string) => {
      const normalized = name.trim().toLowerCase();
      if (!normalized) return;
      if (tags.some((t) => t.name === normalized)) {
        setInput('');
        return;
      }
      setError(null);
      startTransition(async () => {
        const res = await attachCustomerTagsAction(customerId, [normalized]);
        if (res.ok && res.data) {
          setTags(res.data);
          setInput('');
        } else if (!res.ok) {
          setError(res.message);
        }
      });
    },
    [customerId, tags],
  );

  const detach = useCallback(
    (tagId: number) => {
      const i = tags.findIndex((x) => x.id === tagId);
      rendreFocus.current = { vers: 'retirer', id: tagId, voisin: tags[i + 1]?.id ?? tags[i - 1]?.id ?? null };
      setError(null);
      startTransition(async () => {
        const res = await detachCustomerTagAction(customerId, tagId);
        if (res.ok) {
          setTags((prev) => prev.filter((t) => t.id !== tagId));
        } else if (!res.ok) {
          setError(res.message);
        }
      });
    },
    [customerId, tags],
  );

  const refermer = () => {
    rendreFocus.current = { vers: 'ajouter' };
    setOuvert(false);
  };

  const choisir = (s: (typeof suggestions)[number]) => {
    rendreFocus.current = { vers: 'champ' };
    attach(s.name);
    setShowSuggestions(false);
    setActif(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = filteredSuggestions.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n > 0) {
      e.preventDefault();
      setShowSuggestions(true);
      if (e.key === 'ArrowDown') setActif(designee + 1 >= n ? 0 : designee + 1);
      else setActif(designee <= 0 ? n - 1 : designee - 1);
      return;
    }
    if (e.key === 'Enter' && designee >= 0) {
      // Une suggestion désignée : Entrée la prend, pas la saisie partielle.
      e.preventDefault();
      choisir(filteredSuggestions[designee]);
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      rendreFocus.current = { vers: 'champ' };
      attach(input);
    }
    if (e.key === 'Escape') {
      // Sans suggestion ouverte, Échap referme la forme « ligne ».
      if (forme === 'ligne' && !listeOuverte) refermer();
      setShowSuggestions(false);
      setActif(-1);
    }
  };

  // Close suggestion list on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const erreur = error ? (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  ) : null;

  if (forme === 'ligne' && !ouvert) {
    return (
      <div className="space-y-2" data-slot="etiquettes-en-ligne">
        <div role="group" aria-label={t('ligne.titre')} className="flex flex-wrap items-center gap-2">
          <IconeEtiquette className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {tags.map((tag) =>
            onTagClick ? (
              <button
                key={tag.id}
                type="button"
                aria-label={t('filterAria', { tag: libelle(tag) })}
                onClick={() => onTagClick(tag.name)}
                className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-medium text-encre-douce outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring"
              >
                {libelle(tag)}
              </button>
            ) : (
              <span key={tag.id} className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-medium text-encre-douce">
                {libelle(tag)}
              </span>
            ),
          )}
          <button
            ref={ajouter}
            type="button"
            aria-label={t('ligne.ajouterAria')}
            onClick={() => setOuvert(true)}
            className="rounded-sm text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('ligne.ajouter')}
          </button>
        </div>
        {erreur}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const c = tagColor(tag.name);
          return (
            // Deux commandes SŒURS et non imbriquées : un `role="button"` qui contient un
            // `<button>` n'est ni atteignable au clavier ni annonçable proprement.
            <span
              key={tag.id}
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs font-medium',
                c.bg,
                c.text,
                c.border,
              )}
            >
              {onTagClick ? (
                <button
                  type="button"
                  aria-label={t('filterAria', { tag: libelle(tag) })}
                  className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onTagClick(tag.name)}
                >
                  {libelle(tag)}
                </button>
              ) : (
                libelle(tag)
              )}
              {/* Cible visible de 20 px, étendue à 24 × 36 px par le pseudo-élément, sans empiéter sur le
                  nom (écart de 2 px) ni sur la pastille voisine (écart de 6 px). */}
              <button
                type="button"
                aria-label={t('removeAria', { tag: libelle(tag) })}
                data-retirer={tag.id}
                className="relative grid size-5 place-items-center rounded-full transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 after:absolute after:-inset-x-0.5 after:-inset-y-2"
                onClick={() => detach(tag.id)}
                disabled={isPending}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>

      <div className="relative">
        <Input
          type="text"
          role="combobox"
          aria-label={t('inputLabel')}
          aria-autocomplete="list"
          aria-expanded={listeOuverte}
          aria-controls={listeOuverte ? idListe : undefined}
          aria-activedescendant={designee >= 0 ? `${idListe}-${designee}` : undefined}
          placeholder={tags.length >= 10 ? t('maxReachedPlaceholder') : t('addPlaceholder')}
          disabled={tags.length >= 10 || isPending}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setActif(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setShowSuggestions(true)}
          ref={champ}
        />

        {listeOuverte && (
          // Le focus reste dans le champ (combobox) : les flèches désignent une option, Entrée la prend.
          <ul id={idListe} role="listbox" aria-label={t('inputLabel')} className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-md">
            {filteredSuggestions.map((s, i) => {
              const c = tagColor(s.name);
              return (
                <li
                  key={s.id}
                  id={`${idListe}-${i}`}
                  role="option"
                  aria-selected={i === designee}
                  className={cn('w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-muted', i === designee && 'bg-muted')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choisir(s);
                  }}
                >
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        c.bg,
                        c.text,
                        c.border,
                      )}
                    >
                      {libelle(s)}
                    </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {erreur}
      {forme === 'ligne' ? (
        <button
          type="button"
          onClick={refermer}
          className="rounded-sm text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('ligne.terminer')}
        </button>
      ) : null}
    </div>
  );
}

/** Read-only display of tags (for list view). Supports deeplink click. */
export function CustomerTagChips({
  tags,
  onTagClick,
}: {
  tags: TagChip[];
  onTagClick?: (name: string) => void;
}) {
  const libelle = useLibelleEtiquette();
  if (!tags || tags.length === 0) return null;
  // Cliquable = un vrai `<button>` (clavier, annonce), sinon un simple libellé.
  const Chip = onTagClick ? 'button' : 'span';
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const c = tagColor(tag.name);
        return (
          <Chip
            key={tag.id}
            {...(onTagClick ? { type: 'button' as const, onClick: () => onTagClick(tag.name) } : {})}
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              c.bg,
              c.text,
              c.border,
              onTagClick &&
                'cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {libelle(tag)}
          </Chip>
        );
      })}
    </div>
  );
}
