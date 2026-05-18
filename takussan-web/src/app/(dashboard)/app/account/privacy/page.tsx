import type { Metadata } from 'next';
import { DataExportsPanel } from '@/components/privacy/DataExportsPanel';

export const metadata: Metadata = {
  title: 'Confidentialité',
};

export default function AccountPrivacyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-950">Confidentialité</h1>
        <p className="mt-1 text-sm text-stone-600">Demandes de portabilité et suivi des archives disponibles.</p>
      </header>

      <DataExportsPanel />
    </div>
  );
}
