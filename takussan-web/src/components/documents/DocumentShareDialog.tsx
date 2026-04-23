'use client';

import { useCallback, useState } from 'react';
import { useLocale } from 'next-intl';
import { Copy, Link2, Trash2, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import {
  useCreateShareLink,
  useRevokeShareLink,
} from '@/lib/queries/documents';
import type { Document, DocumentShareLink } from '@/types/document';

type TTLOption = '1h' | '24h' | '7d' | '30d';

const TTL_OPTIONS: readonly { value: TTLOption; label: string; ms: number }[] = [
  { value: '1h', label: '1 heure', ms: 1 * 60 * 60 * 1000 },
  { value: '24h', label: '24 heures', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '30 jours', ms: 30 * 24 * 60 * 60 * 1000 },
];

function ttlToExpiresAt(ttl: TTLOption): string {
  const opt = TTL_OPTIONS.find((o) => o.value === ttl);
  const ms = opt?.ms ?? TTL_OPTIONS[1].ms;
  return new Date(Date.now() + ms).toISOString();
}

function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return `/share/${token}`;
  return `${window.location.origin}/api/share/${token}`;
}

interface DocumentShareDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly document: Document | null;
}

/**
 * Share-link modal — generates a temporary link for the current document.
 *
 * Note: the backend currently only exposes `store` + `destroy` for share
 * links (no listing endpoint), so this component keeps freshly-created
 * links in local state for the session. Revocation hits `DELETE` and
 * removes them from the list.
 */
export function DocumentShareDialog({
  open,
  onOpenChange,
  document,
}: DocumentShareDialogProps) {
  const locale = useLocale() as Locale;
  const [ttl, setTtl] = useState<TTLOption>('24h');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [links, setLinks] = useState<DocumentShareLink[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();

  const resetState = useCallback(() => {
    setLinks([]);
    setError(null);
    setCopiedToken(null);
    setTtl('24h');
    setMaxDownloads('');
    setPassword('');
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState();
      onOpenChange(next);
    },
    [onOpenChange, resetState],
  );

  const onCreate = useCallback(async () => {
    if (!document) return;
    setError(null);
    try {
      const res = await createLink.mutateAsync({
        document_id: document.id,
        expires_at: ttlToExpiresAt(ttl),
        max_downloads: maxDownloads ? Number.parseInt(maxDownloads, 10) : undefined,
        password: password || undefined,
      });
      setLinks((prev) => [res.data, ...prev]);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.displayMessage);
      } else {
        setError('Impossible de générer le lien.');
      }
    }
  }, [document, ttl, maxDownloads, password, createLink]);

  const onRevoke = useCallback(
    async (linkId: number) => {
      if (!document) return;
      setError(null);
      try {
        await revokeLink.mutateAsync({
          document_id: document.id,
          link_id: linkId,
        });
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      } catch (e) {
        if (e instanceof ApiError) {
          setError(e.displayMessage);
        } else {
          setError('Impossible de révoquer le lien.');
        }
      }
    },
    [document, revokeLink],
  );

  const onCopy = useCallback(async (token: string) => {
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // ignore — clipboard not supported in the current context
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Partager le document</DialogTitle>
          <DialogDescription>
            {document?.name
              ? `Génère un lien temporaire pour "${document.name}".`
              : 'Génère un lien temporaire pour ce document.'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="share-ttl" className="mb-1.5 block text-sm font-medium">
                Durée
              </Label>
              <Select value={ttl} onValueChange={(v) => setTtl(v as TTLOption)}>
                <SelectTrigger id="share-ttl" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="share-max-downloads" className="mb-1.5 block text-sm font-medium">
                Usages max
              </Label>
              <Input
                id="share-max-downloads"
                type="number"
                min={1}
                max={1000}
                placeholder="Illimité"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="share-password" className="mb-1.5 block text-sm font-medium">
                Mot de passe
              </Label>
              <Input
                id="share-password"
                type="password"
                placeholder="Optionnel"
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void onCreate()}
              disabled={createLink.isPending || !document}
            >
              <Link2 className="mr-1 size-4" aria-hidden="true" />
              {createLink.isPending ? 'Génération…' : 'Générer un lien'}
            </Button>
          </div>
        </div>

        {links.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
              Liens créés dans cette session
            </h4>
            <ul className="space-y-2">
              {links.map((link) => {
                const url = buildShareUrl(link.token);
                return (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
                  >
                    <Input
                      readOnly
                      value={url}
                      className="h-8 min-w-0 flex-1 font-mono text-[11px]"
                      aria-label="URL du lien de partage"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onCopy(link.token)}
                      aria-label="Copier le lien"
                    >
                      {copiedToken === link.token ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Copy className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRevoke(link.id)}
                      aria-label="Révoquer le lien"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                    <div className="flex basis-full gap-3 text-[11px] text-app-ink-muted">
                      {link.expires_at ? (
                        <span>Expire le {formatDateTime(link.expires_at, locale)}</span>
                      ) : (
                        <span>Sans expiration</span>
                      )}
                      {link.max_downloads ? (
                        <span>
                          {link.downloads_count}/{link.max_downloads} usages
                        </span>
                      ) : null}
                      {link.has_password ? <span>Protégé par mot de passe</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button variant="ghost" type="button" onClick={() => handleOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
