'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, UserPlus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { postAgencyOnboarding, type AgencyOnboardingPayload } from '@/lib/queries/super-admin';

type Step = 0 | 1 | 2;

const LANGUAGE_OPTIONS: Array<{ value: 'fr' | 'en' | 'wo'; label: string }> = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
  { value: 'wo', label: 'WO' },
];

export function AgencyOnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [agency, setAgency] = useState({
    name: '',
    slug: '',
    type: '',
    email: '',
    phone: '',
    address: '',
  });
  const [admin, setAdmin] = useState({
    first_name: '',
    last_name: '',
    email: '',
    language: 'fr' as 'fr' | 'en' | 'wo',
  });
  const [createdAgencyId, setCreatedAgencyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const suggestedSlug = useMemo(() => slugify(agency.name), [agency.name]);
  const payload: AgencyOnboardingPayload = {
    agency: compact({
      name: agency.name,
      slug: agency.slug || suggestedSlug,
      type: agency.type,
      email: agency.email,
      phone: agency.phone,
      address: agency.address,
    }),
    admin: {
      first_name: admin.first_name,
      last_name: admin.last_name,
      email: admin.email,
      language: admin.language,
    },
  };

  const mutation = useMutation({
    mutationFn: () => postAgencyOnboarding(payload),
    onSuccess: async (response) => {
      setCreatedAgencyId(response.data.agency.id);
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agencies'] });
      toast.add({
        title: 'Agence créée',
        description: `Invitation envoyée à ${response.data.admin.email}.`,
        type: 'success',
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setError('Un compte existe déjà avec cet email admin.');
        return;
      }
      setError(e instanceof ApiError ? e.displayMessage : 'Création impossible.');
    },
  });

  const agencyValid = agency.name.trim().length > 0 && (!agency.email || agency.email.includes('@'));
  const adminValid = admin.first_name.trim().length > 0
    && admin.last_name.trim().length > 0
    && admin.email.includes('@');

  function reset() {
    setStep(0);
    setAgency({ name: '', slug: '', type: '', email: '', phone: '', address: '' });
    setAdmin({ first_name: '', last_name: '', email: '', language: 'fr' });
    setCreatedAgencyId(null);
    setError(null);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 size-4" aria-hidden="true" />
        Nouvelle agence
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer une agence</DialogTitle>
            <DialogDescription>
              Provisionnez l’agence et son admin initial dans une seule opération auditée.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <StepPill active={step === 0} done={step > 0}>Agence</StepPill>
            <ArrowRight className="size-3" aria-hidden="true" />
            <StepPill active={step === 1} done={step > 1}>Admin initial</StepPill>
            <ArrowRight className="size-3" aria-hidden="true" />
            <StepPill active={step === 2} done={createdAgencyId !== null}>Récap</StepPill>
          </div>

          {step === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom de l’agence">
                <Input value={agency.name} onChange={(e) => setAgency({ ...agency, name: e.target.value })} />
              </Field>
              <Field label="Slug">
                <Input
                  value={agency.slug}
                  placeholder={suggestedSlug}
                  onChange={(e) => setAgency({ ...agency, slug: e.target.value })}
                />
              </Field>
              <Field label="Type">
                <Input value={agency.type} onChange={(e) => setAgency({ ...agency, type: e.target.value })} />
              </Field>
              <Field label="Email contact">
                <Input type="email" value={agency.email} onChange={(e) => setAgency({ ...agency, email: e.target.value })} />
              </Field>
              <Field label="Téléphone">
                <Input value={agency.phone} onChange={(e) => setAgency({ ...agency, phone: e.target.value })} />
              </Field>
              <Field label="Adresse">
                <Input value={agency.address} onChange={(e) => setAgency({ ...agency, address: e.target.value })} />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prénom">
                <Input value={admin.first_name} onChange={(e) => setAdmin({ ...admin, first_name: e.target.value })} />
              </Field>
              <Field label="Nom">
                <Input value={admin.last_name} onChange={(e) => setAdmin({ ...admin, last_name: e.target.value })} />
              </Field>
              <Field label="Email admin">
                <Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              </Field>
              <div className="space-y-2">
                <Label>Langue</Label>
                <div className="flex gap-2">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={admin.language === option.value ? 'default' : 'outline'}
                      onClick={() => setAdmin({ ...admin, language: option.value })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                <p className="font-medium">{agency.name}</p>
                <span className="text-sm text-muted-foreground">/{agency.slug || suggestedSlug}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Admin initial : {admin.first_name} {admin.last_name} · {admin.email}
              </p>
              {createdAgencyId ? (
                <Link className={buttonVariants({ variant: 'outline' })} href={`/super-admin/agencies/${createdAgencyId}`}>
                  Ouvrir la fiche agence
                </Link>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            {step > 0 && !createdAgencyId ? (
              <Button type="button" variant="outline" onClick={() => setStep((step - 1) as Step)} disabled={mutation.isPending}>
                Retour
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => setStep((step + 1) as Step)}
                disabled={step === 0 ? !agencyValid : !adminValid}
              >
                Continuer
              </Button>
            ) : (
              <Button type="button" onClick={() => mutation.mutate()} disabled={!adminValid || mutation.isPending || createdAgencyId !== null}>
                {mutation.isPending ? 'Création…' : createdAgencyId ? (
                  <>
                    <Check className="mr-2 size-4" aria-hidden="true" />
                    Créée
                  </>
                ) : 'Créer et inviter l’admin'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StepPill({ active, done, children }: { active: boolean; done: boolean; children: ReactNode }) {
  return (
    <span className={[
      'rounded-full px-2 py-1',
      active ? 'bg-primary text-primary-foreground' : done ? 'bg-muted text-foreground' : 'bg-transparent',
    ].join(' ')}
    >
      {children}
    </span>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function compact<T extends Record<string, string | undefined>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ''),
  ) as T;
}
