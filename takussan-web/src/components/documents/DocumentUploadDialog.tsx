'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  DOCUMENT_TYPE_ORDER,
  DOCUMENTABLE_UPLOAD_ORDER,
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

export function DocumentUploadDialog({
  open,
  onOpenChange,
  defaultDocumentable,
}: DocumentUploadDialogProps) {
  const t = useTranslations('documents.upload');
  const tTypes = useTranslations('documents.types');
  const tEntities = useTranslations('documents.entities');
  const tCommon = useTranslations('common');
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
        throw new Error(t('no_file_error'));
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
        setFileError(t('too_large'));
        return;
      }
      setFileError(null);
      setFile(picked);
      if (!form.getValues('name')) {
        form.setValue('name', picked.name.replace(/\.[^.]+$/, ''));
      }
    },
    [form, t],
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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {defaultDocumentable?.label
              ? t('description_named', { label: defaultDocumentable.label })
              : t('description_generic')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            if (!file) {
              e.preventDefault();
              setFileError(t('select_file_error'));
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
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60"
          >
            {file ? (
              <>
                <FileText className="size-6 text-primary" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    aria-label={t('remove_file_aria')}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-xs">
                  {t('size_mo', { size: (file.size / (1024 * 1024)).toFixed(2) })}
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-primary" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">
                  {t('dropzone_title')}
                </span>
                <span className="text-xs">{t('dropzone_hint')}</span>
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
            label={t('name_label')}
            required
            placeholder={t('name_placeholder')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<DocumentUploadFormValues>
              control={form.control}
              name="type"
              label={t('category_label')}
              options={DOCUMENT_TYPE_ORDER.map((value) => ({
                value,
                label: tTypes(value),
              }))}
            />
            <FormDatePicker<DocumentUploadFormValues>
              control={form.control}
              name="expiry_date"
              label={t('expiry_label')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<DocumentUploadFormValues>
              control={form.control}
              name="documentable_type"
              label={t('attached_to_label')}
              options={DOCUMENTABLE_UPLOAD_ORDER.map((value) => ({
                value,
                label: tEntities(value),
              }))}
              disabled={disableTargetType}
            />
            <FormInput<DocumentUploadFormValues>
              control={form.control}
              name="documentable_id"
              label={t('entity_id_label')}
              type="number"
              required
              disabled={disableTargetType}
            />
          </div>

          <FormTextarea<DocumentUploadFormValues>
            control={form.control}
            name="description"
            label={t('description_label')}
            rows={2}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !file}>
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
