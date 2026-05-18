'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
  FormDatePicker,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import {
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_MIME_ACCEPT,
  useUploadDocument,
} from '@/lib/queries/documents';
import {
  documentUploadSchema,
  type DocumentUploadFormValues,
} from '@/lib/schemas/document';
import type { DocumentableType } from '@/types/document';

import {
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENTABLE_TYPE_LABEL,
} from './constants';

interface DocumentUploadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Pre-fills the documentable target, e.g. when the dialog is opened from
   * a property/lease/customer detail page.
   */
  readonly defaultDocumentable?: {
    type: DocumentableType;
    id: number;
    label?: string;
  };
}

const DOCUMENTABLE_OPTIONS: readonly { value: DocumentableType; label: string }[] = [
  { value: 'property', label: DOCUMENTABLE_TYPE_LABEL.property },
  { value: 'lease', label: DOCUMENTABLE_TYPE_LABEL.lease },
  { value: 'booking', label: DOCUMENTABLE_TYPE_LABEL.booking },
  { value: 'customer', label: DOCUMENTABLE_TYPE_LABEL.customer },
  { value: 'inventory', label: DOCUMENTABLE_TYPE_LABEL.inventory },
  { value: 'agency', label: DOCUMENTABLE_TYPE_LABEL.agency },
  { value: 'user', label: DOCUMENTABLE_TYPE_LABEL.user },
];

export function DocumentUploadDialog({
  open,
  onOpenChange,
  defaultDocumentable,
}: DocumentUploadDialogProps) {
  const uploadDocument = useUploadDocument();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    DocumentUploadFormValues,
    unknown
  >({
    schema: documentUploadSchema,
    defaultValues: {
      name: '',
      type: 'other',
      documentable_type: defaultDocumentable?.type ?? 'property',
      documentable_id: defaultDocumentable?.id ?? 0,
      description: '',
      expiry_date: '',
    },
    onSubmit: async (values) => {
      if (!file) {
        throw new Error('Veuillez choisir un fichier à téléverser.');
      }
      await uploadDocument.mutateAsync({
        file,
        name: values.name,
        type: values.type,
        documentable_type: values.documentable_type,
        documentable_id: values.documentable_id,
        description: values.description || undefined,
        expiry_date: values.expiry_date || undefined,
      });
      return undefined;
    },
    onSuccess: () => {
      form.reset();
      setFile(null);
      onOpenChange(false);
    },
  });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setFile(null);
        setFileError(null);
        form.reset({
          name: '',
          type: 'other',
          documentable_type: defaultDocumentable?.type ?? 'property',
          documentable_id: defaultDocumentable?.id ?? 0,
          description: '',
          expiry_date: '',
        });
      }
      onOpenChange(next);
    },
    [defaultDocumentable, form, onOpenChange],
  );

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const picked = list[0];
      if (picked.size > DOCUMENT_MAX_SIZE_BYTES) {
        setFileError('Le fichier dépasse 10 Mo.');
        return;
      }
      setFileError(null);
      setFile(picked);
      if (!form.getValues('name')) {
        form.setValue('name', picked.name.replace(/\.[^.]+$/, ''));
      }
    },
    [form],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const disableTargetType = Boolean(defaultDocumentable);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Téléverser un document</DialogTitle>
          <DialogDescription>
            {defaultDocumentable?.label
              ? `Associé à ${defaultDocumentable.label}.`
              : 'Associez le fichier à une entité pour le retrouver ensuite.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            if (!file) {
              e.preventDefault();
              setFileError('Veuillez sélectionner un fichier.');
              return;
            }
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            htmlFor="document-upload-input"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-app-surface-3 px-4 py-6 text-center text-sm text-app-ink-muted transition-colors hover:border-app-accent/60"
          >
            {file ? (
              <>
                <FileText className="size-6 text-app-accent" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-app-ink">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-app-ink-muted hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    aria-label="Retirer le fichier"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-xs">
                  {(file.size / (1024 * 1024)).toFixed(2)} Mo
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-app-accent" aria-hidden="true" />
                <span className="text-sm font-medium text-app-ink">
                  Glissez-déposez ou cliquez pour sélectionner
                </span>
                <span className="text-xs">PDF, image ou document bureautique · 10 Mo maximum</span>
              </>
            )}
            <input
              id="document-upload-input"
              ref={inputRef}
              type="file"
              accept={DOCUMENT_MIME_ACCEPT}
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          {fileError ? (
            <p role="alert" className="text-xs text-destructive">
              {fileError}
            </p>
          ) : null}

          <FormInput<DocumentUploadFormValues>
            control={form.control}
            name="name"
            label="Nom du document"
            required
            placeholder="Ex: Contrat de bail signé"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<DocumentUploadFormValues>
              control={form.control}
              name="type"
              label="Catégorie"
              options={DOCUMENT_TYPE_OPTIONS.map((o) => ({ ...o }))}
            />
            <FormDatePicker<DocumentUploadFormValues>
              control={form.control}
              name="expiry_date"
              label="Date d'expiration"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<DocumentUploadFormValues>
              control={form.control}
              name="documentable_type"
              label="Associé à"
              options={DOCUMENTABLE_OPTIONS.map((o) => ({ ...o }))}
              disabled={disableTargetType}
            />
            <FormInput<DocumentUploadFormValues>
              control={form.control}
              name="documentable_id"
              label="ID de l'entité"
              type="number"
              required
              disabled={disableTargetType}
            />
          </div>

          <FormTextarea<DocumentUploadFormValues>
            control={form.control}
            name="description"
            label="Description"
            rows={2}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting || !file}>
              {isSubmitting ? 'Envoi…' : 'Téléverser'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
