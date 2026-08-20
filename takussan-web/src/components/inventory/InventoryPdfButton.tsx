'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-076 — "Télécharger PDF" button. The PDF route is guarded by session
 * auth (Bearer token) and returns `application/pdf`; we fetch it as a
 * blob and trigger a download, so the user never lands on a blank tab.
 *
 * The backend already rejects with 409 when `signed_at` is null; to keep
 * the UX crisp we hide the button entirely until both signatures are in.
 */
export interface InventoryPdfButtonProps {
  readonly inventoryId: number;
  readonly signedAt: string | null;
  readonly label?: string;
}

export function InventoryPdfButton({
  inventoryId,
  signedAt,
  label,
}: InventoryPdfButtonProps) {
  // ⚠ Le hook précède la sortie anticipée : un `useTranslations` posé après le `return null`
  // serait un hook conditionnel, refusé par le React Compiler (ADR-0015).
  const t = useTranslations('inventory.pdf');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!signedAt) {
    return null;
  }

  const baseUrl =
    (process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
      : 'http://localhost:8002') + `/api/inventories/${inventoryId}/pdf`;

  const handleClick = async () => {
    setDownloading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(baseUrl, {
        headers: {
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(t('unavailable', { status: String(response.status) }));
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `etat-des-lieux-${inventoryId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setErrorMessage(
        messageErreur(err, t('failed')),
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={downloading}
      >
        {downloading ? t('downloading') : label ?? t('download')}
      </Button>
      {errorMessage ? (
        <span className="text-xs text-destructive">{errorMessage}</span>
      ) : null}
    </div>
  );
}
