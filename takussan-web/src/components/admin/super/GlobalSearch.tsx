'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { fetchGlobalSearch, type GlobalSearchHit } from '@/lib/queries/super-admin';
import { cn } from '@/lib/utils';
import { usePlatformAbilities } from './PlatformAbilitiesProvider';

/** Le minimum de l'API (`GlobalSearchRequest` : `q` 2..100). */
const MIN = 2;

/**
 * Les résultats rangés par type, dans l'ordre où l'API les rend : ses correspondances EXACTES
 * (e-mail, téléphone, référence) viennent d'abord, et le groupe qui en porte une passe en tête.
 */
function parType(hits: GlobalSearchHit[]): Array<[string, GlobalSearchHit[]]> {
  const groupes = new Map<string, GlobalSearchHit[]>();
  for (const hit of hits) groupes.set(hit.type, [...(groupes.get(hit.type) ?? []), hit]);
  return [...groupes.entries()];
}

/**
 * TCK-600 (sous-partie 8) — la recherche globale de la console, au clavier depuis toute page :
 * Ctrl+K (⌘K), flèches, Entrée. Réservée au geste `platform.search.global` (`support` et plus).
 */
export function GlobalSearch() {
  const t = useTranslations('superAdmin.globalSearch');
  const { can } = usePlatformAbilities();
  const permis = can('platform.search.global');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!permis) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [permis]);

  if (!permis) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground ring-1 ring-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('trigger')}</span>
        <kbd className="hidden rounded bg-background px-1.5 font-mono text-[11px] sm:inline">{t('shortcut')}</kbd>
      </button>
      {open ? <GlobalSearchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GlobalSearchDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('superAdmin.globalSearch');
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const listId = useId();
  const [saisie, setSaisie] = useState('');
  const [actif, setActif] = useState(0);
  const q = useDebouncedValue(saisie.trim(), 250);
  const pret = q.length >= MIN;

  const { data, isFetching, error } = useQuery({
    queryKey: ['super-admin', 'search', q],
    queryFn: ({ signal }) => fetchGlobalSearch(q, signal),
    enabled: pret,
    staleTime: 30_000,
  });
  const hits = useMemo(() => (pret ? (data?.data ?? []) : []), [data, pret]);
  const groupes = useMemo(() => parType(hits), [hits]);
  // L'ordre de navigation au clavier est celui de l'AFFICHAGE (par groupe), pas celui de l'API.
  const ordre = useMemo(() => groupes.flatMap(([, items]) => items), [groupes]);

  const ouvrir = (hit: GlobalSearchHit | undefined) => {
    if (!hit?.url) return;
    onClose();
    router.push(hit.url);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActif((i) => (ordre.length === 0 ? 0 : (i + 1) % ordre.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActif((i) => (ordre.length === 0 ? 0 : (i - 1 + ordre.length) % ordre.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      ouvrir(ordre[actif]);
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  const typeLabel = (type: string) => (t.has(`types.${type}`) ? t(`types.${type}`) : type);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          role="combobox"
          aria-expanded={ordre.length > 0}
          aria-controls={listId}
          aria-activedescendant={ordre.length > 0 ? optionId(actif) : undefined}
          aria-label={t('placeholder')}
          placeholder={t('placeholder')}
          value={saisie}
          maxLength={100}
          onChange={(e) => {
            setSaisie(e.target.value);
            setActif(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="max-h-[60vh] overflow-y-auto">
          {!pret ? <p className="p-2 text-sm text-muted-foreground">{t('hint')}</p> : null}
          {pret && error ? (
            <p role="alert" className="p-2 text-sm text-destructive">
              {messageErreur(error)}
            </p>
          ) : null}
          {pret && !error && !isFetching && data && ordre.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">{t('empty', { q })}</p>
          ) : null}
          <div id={listId} role="listbox" aria-label={t('title')}>
            {groupes.map(([type, items]) => (
              <div key={type} role="group" aria-label={typeLabel(type)} className="pb-2">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {typeLabel(type)}
                </p>
                {items.map((hit) => {
                  const index = ordre.indexOf(hit);
                  return (
                    <div
                      key={`${hit.type}-${hit.id}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === actif}
                      aria-disabled={hit.url ? undefined : true}
                      onMouseEnter={() => setActif(index)}
                      onClick={() => ouvrir(hit)}
                      className={cn(
                        'flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm',
                        index === actif ? 'bg-muted text-foreground' : 'text-foreground/90',
                        !hit.url && 'cursor-default opacity-70',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{hit.label}</span>
                        {hit.sublabel ? (
                          <span className="block truncate text-xs text-muted-foreground">{hit.sublabel}</span>
                        ) : null}
                      </span>
                      {hit.agency ? (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{hit.agency.name}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
