'use client';

import { AnnouncementsConsole } from '@/components/admin/super/announcements';

export default function SuperAdminAnnouncementsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Annonces in-app</h1>
        <p className="mt-1 text-sm text-stone-600">
          Messages transverses ciblés par rôle, agence ou rollout progressif.
        </p>
      </header>

      <AnnouncementsConsole />
    </div>
  );
}
