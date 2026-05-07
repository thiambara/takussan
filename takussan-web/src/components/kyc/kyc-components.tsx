'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, Send, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { postKycReview } from '@/lib/queries/super-admin';
import { submitAgencyKyc, uploadAgencyKycDocument } from '@/lib/queries/kyc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { KycDossier, KycDossierStatus } from '@/types/super-admin';

type DocumentType = 'rccm' | 'ninea' | 'director_id';

const DOCUMENTS: Array<{ type: DocumentType; label: string }> = [
  { type: 'rccm', label: 'RCCM' },
  { type: 'ninea', label: 'NINEA' },
  { type: 'director_id', label: 'Pièce dirigeant' },
];

const STATUS_LABEL: Record<KycDossierStatus, string> = {
  pending: 'À compléter',
  submitted: 'Soumis',
  verified: 'Vérifié',
  rejected: 'Rejeté',
};

export function KycDossierTimeline({ dossier }: { dossier: KycDossier }) {
  const steps = [
    { status: 'pending', label: 'Création', date: dossier.created_at },
    { status: 'submitted', label: 'Soumission', date: dossier.submitted_at },
    { status: dossier.status === 'rejected' ? 'rejected' : 'verified', label: dossier.status === 'rejected' ? 'Rejet' : 'Décision', date: dossier.reviewed_at },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          Timeline KYC
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={dossier.status} />
          {dossier.rejection_reason ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Motif disponible
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.label} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{formatDate(step.date)}</p>
            </div>
          ))}
        </div>
        {dossier.rejection_reason ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {dossier.rejection_reason}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KycDocumentUploader({ agencyId, dossier }: { agencyId: number; dossier: KycDossier }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const locked = dossier.status === 'verified';
  const documentsByType = useMemo(
    () => new Map(dossier.documents.map((doc) => [doc.document_type, doc])),
    [dossier.documents],
  );

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: DocumentType; file: File }) => uploadAgencyKycDocument(agencyId, type, file),
    onSuccess: async () => {
      toast.add({ title: 'Pièce ajoutée', type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['agency', agencyId, 'kyc'] });
    },
    onError: (error) => toast.add({ title: 'Upload impossible', description: messageFor(error), type: 'error' }),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAgencyKyc(agencyId),
    onSuccess: async () => {
      toast.add({ title: 'Dossier soumis', type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['agency', agencyId, 'kyc'] });
    },
    onError: (error) => toast.add({ title: 'Soumission impossible', description: messageFor(error), type: 'error' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pièces justificatives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {DOCUMENTS.map((item) => {
          const uploaded = documentsByType.get(item.type);
          return (
            <div key={item.type} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{item.label}</p>
                  {uploaded ? <Badge variant="secondary">Fourni</Badge> : <Badge variant="outline">Manquant</Badge>}
                </div>
                {uploaded ? (
                  <a className="mt-1 inline-flex items-center text-sm text-primary hover:underline" href={uploaded.signed_url} target="_blank" rel="noreferrer">
                    <FileText className="mr-1 size-4" aria-hidden="true" />
                    {uploaded.file_name}
                    <ExternalLink className="ml-1 size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={locked || uploadMutation.isPending}
                  onChange={(event) => setFiles((current) => ({ ...current, [item.type]: event.target.files?.[0] }))}
                  className="md:w-64"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || !files[item.type] || uploadMutation.isPending}
                  onClick={() => {
                    const file = files[item.type];
                    if (file) uploadMutation.mutate({ type: item.type, file });
                  }}
                >
                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  Ajouter
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={locked || dossier.status === 'submitted' || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="mr-2 size-4" aria-hidden="true" />
            Soumettre le dossier
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function KycReviewPanel({ dossier, agencyId }: { dossier: KycDossier; agencyId?: number }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const canReview = dossier.status === 'submitted';

  const mutation = useMutation({
    mutationFn: (action: 'verify' | 'reject') => postKycReview(dossier.id, action, reason),
    onSuccess: async (_, action) => {
      toast.add({ title: action === 'verify' ? 'Dossier vérifié' : 'Dossier rejeté', type: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'kyc'] }),
        agencyId ? queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId, 'kyc'] }) : Promise.resolve(),
        agencyId ? queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId] }) : Promise.resolve(),
      ]);
      setReason('');
    },
    onError: (error) => toast.add({ title: 'Décision impossible', description: messageFor(error), type: 'error' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instruction super-admin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {DOCUMENTS.map((item) => {
            const present = dossier.documents.some((doc) => doc.document_type === item.type);
            return (
              <div key={item.type} className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-medium">{item.label}</span>
                {present ? <CheckCircle2 className="size-5 text-accent" aria-hidden="true" /> : <XCircle className="size-5 text-destructive" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motif de rejet"
          disabled={!canReview || mutation.isPending}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={!canReview || mutation.isPending} onClick={() => mutation.mutate('verify')}>
            <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            Vérifier
          </Button>
          <Button type="button" variant="destructive" disabled={!canReview || reason.trim().length < 5 || mutation.isPending} onClick={() => mutation.mutate('reject')}>
            <XCircle className="mr-2 size-4" aria-hidden="true" />
            Rejeter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: KycDossierStatus }) {
  if (status === 'verified') return <Badge className="bg-accent text-white hover:bg-accent">{STATUS_LABEL[status]}</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  if (status === 'submitted') return <Badge className="bg-primary text-primary-foreground hover:bg-primary">{STATUS_LABEL[status]}</Badge>;
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.displayMessage : 'Réessayez dans quelques instants.';
}
