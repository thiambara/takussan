'use client';

import { useRouter } from 'next/navigation';

import { CustomerTagPicker } from './CustomerTagPicker';
import type { Tag } from '@/types/tag';

interface Props {
  customerId: number;
  initialTags: Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[];
  suggestions?: Pick<Tag, 'id' | 'name' | 'color'>[];
}

/**
 * Thin client shell that wires the deeplink navigation for the tag picker.
 * Clicking a tag on the detail page navigates to the CRM list filtered by
 * that tag (/app/customers?tags=<name>).
 */
export function CustomerTagPickerSection({ customerId, initialTags, suggestions }: Props) {
  const router = useRouter();

  return (
    <section className="rounded-xl bg-app-surface-1 p-4">
      <h2 className="mb-3 text-sm font-semibold text-app-ink">Tags</h2>
      <CustomerTagPicker
        customerId={customerId}
        initialTags={initialTags}
        suggestions={suggestions}
        onTagClick={(name) => router.push(`/app/customers?tags=${encodeURIComponent(name)}`)}
      />
    </section>
  );
}
