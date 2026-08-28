'use client';

import { Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-268 — Reusable, dependency-free PDF / image preview.
 *
 * Designed for the super-admin upgrade review console: super-admins need
 * to glance at a `statuts` scan without leaving the detail page. We
 * intentionally avoid a heavy lib (pdf.js / react-pdf) — the browser's
 * built-in viewer is good enough for first-pass triage and downloads
 * remain a one-click escape hatch.
 *
 * Falls back to a download-only card when no URL is available.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-384 — le chrome de la visionneuse sur les jetons, et LE BLANC DE LA PAGE, tranché
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Onze occurrences de palette brute vivaient ici — dix sur l'échelle pierre plus une ambre —
 * le plus gros lot du reste non gardé de la console. Traduction par RÔLE, contrastes mesurés le
 * 2026-08-27 (WCAG 2.1) :
 *
 *   cadre et filets   → `border-border`         (le filet, dans les deux thèmes)
 *   fond de l'en-tête → `bg-muted`              (une surface secondaire, pas une carte)
 *   texte secondaire  → `text-muted-foreground` 4,85:1 clair · 5,79:1 sombre
 *   nom du fichier    → `text-foreground`      14,87:1 clair · 12,53:1 sombre
 *   glyphe du format  → `text-primary`          4,51:1 clair · 3,99:1 sombre
 *
 * Le glyphe portait un ambre 600, mesuré à **3,06:1** sur son fond — au ras des 3:1 de WCAG
 * 1.4.11 pour un objet graphique. Il ne dit ni « attention » ni « erreur » : il identifie un
 * document. C'est donc l'accent de MARQUE qui le porte, pas `--warning` — traduire par teinte
 * proche aurait donné le second, et aurait fait dire à ce glyphe quelque chose qu'il ne dit pas.
 *
 * ⚠ **LE BLANC DU CADRE DE PRÉVISUALISATION est tranché explicitement, et il NE relève PAS de
 * `.qr-surface`.** Le blanc fonctionnel de `globals.css` existe pour une seule raison : un QR
 * code doit rester lisible par un TÉLÉPHONE, qui ne connaît pas le thème. Rien ne lit à la
 * machine le cadre d'un `<object>` : ce que le lecteur PDF du navigateur y peint, il le peint
 * par-dessus, avec sa propre chrome. Le blanc n'était donc visible que pendant les quelques
 * trames d'initialisation du greffon — et, sous `.dark`, c'était un éclair blanc au milieu d'une
 * page sombre. Il passe sur `--card`, comme le repli de téléchargement qu'il enveloppe.
 *
 * ⚠ Ce cadre n'a PAS été vérifié dans un navigateur (aucun serveur de développement n'était
 * lancé lors du portage) : le raisonnement ci-dessus porte sur le rôle, pas sur une capture.
 */
export interface PdfViewerProps {
  readonly url: string | null;
  readonly filename?: string | null;
  readonly className?: string;
  readonly height?: number;
}

export function PdfViewer({ url, filename, className, height = 480 }: PdfViewerProps) {
  // Le hook se place AVANT la sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('files.pdfViewer');

  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground',
          className,
        )}
        role="status"
      >
        <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{t('noFile')}</span>
      </div>
    );
  }

  const safeName = filename ?? 'document';

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
          <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{safeName}</span>
        </div>
        <a
          href={url}
          download={safeName}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Download className="mr-1 size-3.5" aria-hidden="true" />
          {t('download')}
        </a>
      </header>
      <object
        data={url}
        type="application/pdf"
        className="block w-full bg-card"
        style={{ height }}
        aria-label={t('previewAria', { name: safeName })}
      >
        <div className="flex h-40 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          <p>{t('unavailable')}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            {t('open')}
          </a>
        </div>
      </object>
    </div>
  );
}
