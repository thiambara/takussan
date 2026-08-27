'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  attachCustomerTagsAction,
  detachCustomerTagAction,
} from '@/app/actions/dashboard-customers';
import { cn } from '@/lib/utils';
import type { CustomerListItem } from '@/types/customer';
import type { Tag } from '@/types/tag';

/**
 * Deterministic color from tag name hash — cycles through a CRM-friendly palette.
 * The backend stores `color` only when manually overridden; for new tags we derive
 * it client-side so the same name always renders the same hue.
 */
const PALETTE = [
  { bg: 'bg-info/15', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-info/15', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' },
  { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30' },
  { bg: 'bg-destructive/15', text: 'text-destructive', border: 'border-destructive/30' },
  { bg: 'bg-info/15', text: 'text-info', border: 'border-info/30' },
  { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' },
  { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30' },
];

function tagColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type TagChip = Pick<Tag, 'id' | 'name' | 'slug' | 'color'>;

interface Props {
  customerId: number;
  initialTags: TagChip[];
  /** Suggestions fetched server-side — top CRM tags for the agency */
  suggestions?: Pick<Tag, 'id' | 'name' | 'color'>[];
  /** Deeplink: clicking a tag navigates to list filtered by that tag */
  onTagClick?: (tagName: string) => void;
}

export function CustomerTagPicker({
  customerId,
  initialTags,
  suggestions = [],
  onTagClick,
}: Props) {
  const t = useTranslations('crm.tags');
  const [tags, setTags] = useState<TagChip[]>(initialTags);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      input.trim().length > 0 &&
      s.name.toLowerCase().includes(input.toLowerCase().trim()) &&
      !tags.some((t) => t.name === s.name),
  );

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
    [customerId],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      attach(input);
    }
    if (e.key === 'Escape') setShowSuggestions(false);
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

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const c = tagColor(tag.name);
          return (
            <span
              key={tag.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                c.bg,
                c.text,
                c.border,
                onTagClick && 'cursor-pointer hover:opacity-80',
              )}
              onClick={onTagClick ? () => onTagClick(tag.name) : undefined}
              role={onTagClick ? 'button' : undefined}
            >
              {tag.name}
              <button
                type="button"
                aria-label={t('removeAria', { tag: tag.name })}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                onClick={(e) => {
                  e.stopPropagation();
                  detach(tag.id);
                }}
                disabled={isPending}
              >
                <X className="size-2.5" />
              </button>
            </span>
          );
        })}
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder={tags.length >= 10 ? t('maxReachedPlaceholder') : t('addPlaceholder')}
          disabled={tags.length >= 10 || isPending}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setShowSuggestions(true)}
          className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {showSuggestions && filteredSuggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-md">
            {filteredSuggestions.map((s) => {
              const c = tagColor(s.name);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-card"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      attach(s.name);
                      setShowSuggestions(false);
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
                      {s.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
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
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const c = tagColor(tag.name);
        return (
          <span
            key={tag.id}
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              c.bg,
              c.text,
              c.border,
              onTagClick && 'cursor-pointer hover:opacity-80',
            )}
            onClick={onTagClick ? () => onTagClick(tag.name) : undefined}
            role={onTagClick ? 'button' : undefined}
          >
            {tag.name}
          </span>
        );
      })}
    </div>
  );
}
