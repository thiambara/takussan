import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { isAdmin, isAgent, isOwner, isSuperAdmin } from '@/lib/roles';
import { BookingsList } from '@/components/bookings/BookingsList';
import { MesReservations } from '@/components/bookings/liste/MesReservations';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.bookings');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.bookings');
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/bookings
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  // TCK-2594 — le personnel et le bailleur lisent les demandes par nature (Séjours, Candidatures,
  // Offres) ; « Saisir une demande » (TCK-2580) reste au seul personnel, dans la liste.
  if (isSuperAdmin(user.roles) || isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles)) {
    return <BookingsList titre={t('title')} />;
  }

  // TCK-2594 — le client lit « Mes réservations » (En cours, Terminées, Annulées).
  return <MesReservations />;
}
