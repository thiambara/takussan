'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DocumentableType } from '@/types/document';

import { DocumentUploadDialog } from './DocumentUploadDialog';

interface AddDocumentButtonProps {
  readonly documentableType: DocumentableType;
  readonly documentableId: number;
  readonly label?: string;
  readonly size?: 'sm' | 'default' | 'lg';
  readonly variant?: 'default' | 'outline' | 'ghost';
  readonly displayLabel?: string;
}

/**
 * Reusable "Ajouter un document" button. Opens the upload dialog with the
 * `documentable_type` / `documentable_id` pre-filled. Mounted in the
 * property/lease/customer detail pages (AC5 of TCK-062).
 */
export function AddDocumentButton({
  documentableType,
  documentableId,
  label = 'Ajouter un document',
  size = 'sm',
  variant = 'outline',
  displayLabel,
}: AddDocumentButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-4" aria-hidden="true" />
        {label}
      </Button>
      <DocumentUploadDialog
        open={open}
        onOpenChange={setOpen}
        defaultDocumentable={{
          type: documentableType,
          id: documentableId,
          label: displayLabel,
        }}
      />
    </>
  );
}
