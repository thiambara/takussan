/**
 * TCK-633 (lot C) — le profil porte la case WhatsApp du numéro principal (une fois ce numéro
 * enregistré ET vérifié) et la section du second numéro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { ProfileContactSection } from '../ProfileContactSection';

const courant = vi.hoisted(() => ({ user: null as User | null }));

vi.mock('@/app/actions/auth', () => ({ updateProfileAction: vi.fn(), resendVerificationEmailAction: vi.fn() }));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/app/actions/secondary-phone', () => ({
  secondaryPhoneSendOtpAction: vi.fn(),
  secondaryPhoneVerifyAction: vi.fn(),
  secondaryPhoneRemoveAction: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: courant.user, token: 't', isLoading: false, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

const BASE: User = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Ndiaye',
  full_name: 'Awa Ndiaye',
  email: 'awa@example.com',
  phone: '+221770000601',
  bio: null,
  avatar_url: null,
  email_verified_at: '2026-04-01T00:00:00Z',
  phone_verified_at: '2026-10-01T00:00:00Z',
  two_factor_enabled: false,
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  phone_whatsapp: true,
};

beforeEach(() => {
  courant.user = BASE;
});

describe('<ProfileContactSection> — WhatsApp et second numéro (TCK-633)', () => {
  it('numéro vérifié : la case WhatsApp du principal et la section du second', () => {
    render(withIntl(<ProfileContactSection user={BASE} />));

    expect(screen.getByTestId('phone_whatsapp-toggle')).toBeChecked();
    expect(screen.getByTestId('secondary-phone-section')).toBeInTheDocument();
  });

  it('numéro non vérifié : ni case, ni second numéro', () => {
    const nonVerifie = { ...BASE, phone_verified_at: null };
    courant.user = nonVerifie;
    render(withIntl(<ProfileContactSection user={nonVerifie} />));

    expect(screen.queryByTestId('phone_whatsapp-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('secondary-phone-section')).not.toBeInTheDocument();
  });
});
