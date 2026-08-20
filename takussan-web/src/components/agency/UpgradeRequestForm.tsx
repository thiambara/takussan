'use client';

/**
 * TCK-267 — agency upgrade-request form (`individual → standard`).
 *
 * Single-step legal form. Reuses {@link useWizardDraft} for resumable
 * autosave under the key `agency-upgrade-{agency_id}`, so an admin who
 * starts typing the RC / NINEA / RIB and leaves the page comes back to
 * exactly the state they left. The uploaded PDF is intentionally NOT
 * persisted across sessions — binary blobs don't belong in the
 * wizard-drafts JSON column, the user re-attaches the file when they
 * resume.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { ApiError } from '@/lib/api';
import { submitAgencyUpgradeRequest } from '@/lib/queries/agency-upgrade';
import type { AgencyUpgradeRequestFormFields } from '@/types/agency-upgrade';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export type UpgradeRequestFormProps = {
  readonly agencyId: number;
};

const EMPTY_FORM: AgencyUpgradeRequestFormFields = {
  rc: '',
  ninea: '',
  rib_pro: '',
  company_legal_name: '',
  address_fiscale: '',
  planned_agents_count: null,
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors backend cap.
const ACCEPT_MIME = 'application/pdf,image/jpeg,image/png';

export function UpgradeRequestForm({ agencyId }: UpgradeRequestFormProps) {
  const t = useTranslations('agency.upgrade.form');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const draftKey = `agency-upgrade-${agencyId}`;
  const { draft, isLoading, save, flush, clear } =
    useWizardDraft<AgencyUpgradeRequestFormFields>(draftKey);

  const [form, setForm] = useState<AgencyUpgradeRequestFormFields>(EMPTY_FORM);
  const [hydrated, setHydrated] = useState(false);
  const [statutsDoc, setStatutsDoc] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydratation depuis le brouillon serveur, au premier chargement.
  //
  // TCK-316 — pendant le RENDU, pas dans un effet. L'effet peignait d'abord le
  // formulaire vide, puis le remplissait au tick suivant : l'utilisateur voyait
  // ses champs se remplir après coup, et un `onChange` tapé dans cet intervalle
  // était écrasé par l'hydratation. L'écriture converge (`hydrated` passe à
  // `true` et n'en revient pas), ce que React autorise explicitement.
  if (!hydrated && !isLoading) {
    setHydrated(true);
    if (draft?.data) {
      setForm({ ...EMPTY_FORM, ...(draft.data as Partial<AgencyUpgradeRequestFormFields>) });
    }
  }

  // Autosave on every change (debounced inside the hook).
  useEffect(() => {
    if (!hydrated) return;
    save(0, form);
  }, [hydrated, form, save]);

  function update<K extends keyof AgencyUpgradeRequestFormFields>(
    key: K,
    value: AgencyUpgradeRequestFormFields[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setStatutsDoc(null);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFieldErrors((prev) => ({ ...prev, statuts_doc: [t('errors.file_too_large')] }));
      setStatutsDoc(null);
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.statuts_doc;
      return next;
    });
    setStatutsDoc(file);
  }

  function fieldError(key: string): string | undefined {
    return fieldErrors[key]?.[0];
  }

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      if (!token) {
        toast.add({ title: t('errors.unauthorized'), type: 'error' });
        return;
      }
      if (!statutsDoc) {
        setFieldErrors((prev) => ({ ...prev, statuts_doc: [t('errors.file_required')] }));
        return;
      }

      setSubmitting(true);
      try {
        await flush();
        await submitAgencyUpgradeRequest(token, agencyId, form, statutsDoc);
        await clear();
        toast.add({ title: t('toasts.submitted'), type: 'success' });
        router.refresh();
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 422 && error.validationErrors) {
            setFieldErrors(error.validationErrors);
            return;
          }
          if (error.status === 403) {
            toast.add({
              title: t('errors.forbidden'),
              description: messageErreur(error),
              type: 'error',
            });
            return;
          }
          toast.add({
            title: t('errors.generic'),
            description: messageErreur(error),
            type: 'error',
          });
          return;
        }
        toast.add({ title: t('errors.generic'), type: 'error' });
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, token, statutsDoc, flush, agencyId, form, clear, toast, t, router, messageErreur],
  );

  if (!hydrated) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('loading')}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-label={t('aria_label')}
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="upgrade-rc">{t('fields.rc')}</Label>
          <Input
            id="upgrade-rc"
            required
            value={form.rc ?? ''}
            onChange={(e) => update('rc', e.target.value)}
            aria-invalid={!!fieldError('rc')}
          />
          {fieldError('rc') ? (
            <p className="text-xs text-destructive">{fieldError('rc')}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="upgrade-ninea">{t('fields.ninea')}</Label>
          <Input
            id="upgrade-ninea"
            required
            value={form.ninea ?? ''}
            onChange={(e) => update('ninea', e.target.value)}
            aria-invalid={!!fieldError('ninea')}
          />
          {fieldError('ninea') ? (
            <p className="text-xs text-destructive">{fieldError('ninea')}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upgrade-rib-pro">{t('fields.rib_pro')}</Label>
        <Input
          id="upgrade-rib-pro"
          required
          value={form.rib_pro ?? ''}
          onChange={(e) => update('rib_pro', e.target.value)}
          aria-invalid={!!fieldError('rib_pro')}
        />
        {fieldError('rib_pro') ? (
          <p className="text-xs text-destructive">{fieldError('rib_pro')}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upgrade-company-legal-name">
          {t('fields.company_legal_name')}
        </Label>
        <Input
          id="upgrade-company-legal-name"
          required
          value={form.company_legal_name ?? ''}
          onChange={(e) => update('company_legal_name', e.target.value)}
          aria-invalid={!!fieldError('company_legal_name')}
        />
        {fieldError('company_legal_name') ? (
          <p className="text-xs text-destructive">{fieldError('company_legal_name')}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upgrade-address-fiscale">{t('fields.address_fiscale')}</Label>
        <Input
          id="upgrade-address-fiscale"
          required
          value={form.address_fiscale ?? ''}
          onChange={(e) => update('address_fiscale', e.target.value)}
          aria-invalid={!!fieldError('address_fiscale')}
        />
        {fieldError('address_fiscale') ? (
          <p className="text-xs text-destructive">{fieldError('address_fiscale')}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upgrade-planned-agents">
          {t('fields.planned_agents_count')}
        </Label>
        <Input
          id="upgrade-planned-agents"
          type="number"
          min={1}
          max={10000}
          value={form.planned_agents_count ?? ''}
          onChange={(e) =>
            update(
              'planned_agents_count',
              e.target.value === '' ? null : Number(e.target.value),
            )
          }
          aria-invalid={!!fieldError('planned_agents_count')}
        />
        <p className="text-xs text-muted-foreground">
          {t('hints.planned_agents_count')}
        </p>
        {fieldError('planned_agents_count') ? (
          <p className="text-xs text-destructive">
            {fieldError('planned_agents_count')}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="upgrade-statuts-doc">{t('fields.statuts_doc')}</Label>
        <Input
          ref={fileInputRef}
          id="upgrade-statuts-doc"
          type="file"
          required
          accept={ACCEPT_MIME}
          onChange={handleFileChange}
          aria-invalid={!!fieldError('statuts_doc')}
        />
        <p className="text-xs text-muted-foreground">{t('hints.statuts_doc')}</p>
        {statutsDoc ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('file_selected', { name: statutsDoc.name })}
          </p>
        ) : null}
        {fieldError('statuts_doc') ? (
          <p className="text-xs text-destructive">{fieldError('statuts_doc')}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? t('cta.submitting') : t('cta.submit')}
        </Button>
      </div>
    </form>
  );
}
