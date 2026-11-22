'use client';

import { useTranslations } from 'next-intl';

import { FileDePropositions } from '@/components/admin/super/FileDePropositions';
import { PhotosDeQuartiers } from '@/components/admin/super/PhotosDeQuartiers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * TCK-633 (AC5) — les quartiers saisis hors du référentiel, à approuver, renommer, fusionner ou refuser.
 * TCK-2844 (ADR-0109) — à côté, les quartiers approuvés et leur photo (tuiles de l'accueil).
 */
export default function SuperAdminGeoPage() {
  const t = useTranslations('superAdmin.photosDeQuartier.tabs');

  return (
    <Tabs defaultValue="proposals">
      <TabsList>
        <TabsTrigger value="proposals">{t('proposals')}</TabsTrigger>
        <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
      </TabsList>
      <TabsContent value="proposals" className="pt-4"><FileDePropositions genre="geo" /></TabsContent>
      <TabsContent value="approved" className="pt-4"><PhotosDeQuartiers /></TabsContent>
    </Tabs>
  );
}
