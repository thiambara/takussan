'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, UploadCloud, X } from 'lucide-react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { messageCorpsErreurBff } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * TCK-261 — minimal KYC uploader.
 *
 * Talks to a SSR proxy that forwards the multipart body to the Laravel
 * backend with the user's bearer cookie. **Reused by TCK-257** (Owner
 * wizard) — pass `endpoint='owner-profiles'` to target the owner upload
 * route; defaults to `'profiles'` (SP). **Reused by TCK-259** (Agent
 * wizard) — pass `endpoint='agent-profiles'` + `kind='license'|'cni'|'photo'`.
 *
 * The component is intentionally barebones: a drop zone, a file picker
 * fallback, an inline preview / "remove" affordance. No image cropping,
 * no on-device resizing — those are upstream of the wizard.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-385 — la pastille « document fourni », et l'endroit où ce fichier se trouvait
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle était composée à la main sur deux familles de l'échelle Tailwind — un fond émeraude 100,
 * une encre émeraude 800 — pour un état qui a un TON dans le design system. Elle rend désormais
 * `<StatusBadge tone="success">`, le composant qui décide la couleur d'un statut pour toute la
 * console : c'est le seul moyen que « le même vert dans les trois assistants ET dans la console »
 * soit vrai plutôt que déclaré.
 *
 * ⚠ **Le contraste BAISSE, et le chiffre est écrit ici plutôt que tu** (WCAG 2.1, mesuré le
 * 2026-08-27 sur la surface RÉELLE — la pastille est un aplat à 15 % posé sur le conteneur de ce
 * composant, lui-même `bg-muted/30` sur la page) :
 *
 *   avant   émeraude 800 #006045 sur émeraude 100 #d0fae5 .......... 6,70:1  ✓
 *   après   --accent #5d6e4f sur accent/15 (clair) ................. 4,19:1  ✗ (AA : 4,5)
 *   après   --accent #7d8d6e sur accent/15 (sombre) ................ 3,71:1  ✗
 *
 * Ce n'est PAS un défaut de ce portage : c'est celui du ton `success` de `StatusBadge`, qui
 * emprunte `--accent` — l'accent de MARQUE — là où `--success` existe depuis TCK-381 pour dire
 * « ça a marché ». Le même aplat sur `--success` rend 4,61:1 en clair et 5,73:1 en sombre, tous
 * deux au-dessus d'AA. Le corriger touche toutes les pastilles de la console d'un coup : c'est
 * une décision de charte, hors du delta de ce ticket-ci — reportée, avec ces mesures.
 *
 * L'échelle Tailwind, elle, achetait ses 6,70:1 en sortant de la famille chromatique du produit,
 * et sans basculer sous `.dark` : `#d0fae5` y restait `#d0fae5`.
 */
export type KycUploaderProps = {
  profileId: number;
  /** Backend `kind` discriminator. Maps to `App\Models\Enums\DocumentType`. */
  kind: 'cni' | 'insurance' | 'rib' | 'ninea' | 'license' | 'photo';
  /** Callback fired after a successful upload. Receives the API row id. */
  onUploaded?: (info: { id: number; fileName: string }) => void;
  /** i18n key used for the heading + helper text. Falls back to `kind`. */
  labelKey?: string;
  /** Compact variant — no separate heading, smaller drop zone. */
  compact?: boolean;
  /**
   * SSR proxy segment — pick `'profiles'` for the SP endpoint (default,
   * TCK-261), `'owner-profiles'` for the Owner endpoint (TCK-257), or
   * `'agent-profiles'` for the Agent endpoint (TCK-259). Every proxy
   * shares the same multipart contract.
   */
  endpoint?: 'profiles' | 'owner-profiles' | 'agent-profiles';
  /** i18n namespace for labels/hints. Defaults to SP namespace. */
  i18nNamespace?: string;
};

const ACCEPT = 'image/*,application/pdf';
const MAX_BYTES = 8 * 1024 * 1024; // mirrors the backend max:8192 (KB)

export function KycUploader({
  profileId,
  kind,
  onUploaded,
  labelKey,
  compact = false,
  endpoint = 'profiles',
  i18nNamespace = 'serviceProviders.onboarding.kyc',
}: KycUploaderProps) {
  const t = useTranslations(i18nNamespace);
  // Traducteur à la RACINE : les clés d'erreur du BFF sont des chemins absolus
  // (`errors.api.…`), que `t` — porté par `i18nNamespace` — ne peut pas résoudre.
  const tRacine = useTranslations();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploaded, setUploaded] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const heading = t(`labels.${labelKey ?? kind}` as never);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_BYTES) {
        setError(t('errors.fileTooLarge'));
        return;
      }
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);

      startTransition(async () => {
        try {
          const res = await fetch(`/api/me/${endpoint}/${profileId}/kyc/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          });
          if (!res.ok) {
            const body: unknown = await res.json().catch(() => null);
            // Le corps ne porte plus de prose fabriquée par le BFF (TCK-292, AC7) : soit un code
            // que ce dépôt traduit, soit un message de Laravel déjà localisé. Lu tel quel, il
            // affichait « Not authenticated. » en français dès qu'une session expirait.
            const message = messageCorpsErreurBff(body, tRacine, t('errors.uploadFailed'));
            setError(message);
            toast.add({ title: t('errors.title'), description: message, type: 'error' });
            return;
          }
          const body = (await res.json()) as {
            data: { id: number; file_name: string };
          };
          setUploaded({ id: body.data.id, name: body.data.file_name });
          toast.add({
            title: t('success.title'),
            description: t('success.body', { name: body.data.file_name }),
            type: 'success',
          });
          onUploaded?.({ id: body.data.id, fileName: body.data.file_name });
        } catch {
          const message = t('errors.uploadFailed');
          setError(message);
          toast.add({ title: t('errors.title'), description: message, type: 'error' });
        }
      });
    },
    [endpoint, kind, onUploaded, profileId, t, tRacine, toast],
  );

  const handlePick = () => inputRef.current?.click();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    // Reset so picking the same filename again still triggers `change`.
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    // The backend keeps the row (we let TCK-257 introduce a delete endpoint
    // when needed). For now we simply forget the local UI state so the user
    // can re-pick a different file — re-uploading replaces the media via
    // `updateOrCreate` server-side.
    setUploaded(null);
    setError(null);
  };

  return (
    <div
      data-testid={`kyc-uploader-${kind}`}
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4',
        compact && 'p-3',
      )}
    >
      {!compact ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">{heading}</p>
            <p className="text-xs text-muted-foreground">
              {t(`hints.${labelKey ?? kind}` as never)}
            </p>
          </div>
          {uploaded ? (
            <StatusBadge
              tone="success"
              icon={<Check className="size-3" aria-hidden />}
              label={t('uploadedBadge')}
            />
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={handleChange}
      />

      {!uploaded ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handlePick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePick();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground transition',
            dragOver && 'border-primary bg-primary/5 text-primary',
            pending && 'opacity-60',
          )}
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="size-5" aria-hidden />
          )}
          <span>{pending ? t('uploading') : t('dropZone')}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <span className="truncate text-foreground">{uploaded.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            data-testid={`kyc-remove-${kind}`}
            aria-label={t('removeAria')}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
