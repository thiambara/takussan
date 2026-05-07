'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { MaintenanceStatusResponse } from '@/types/super-admin';

async function fetchStatus(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/maintenance/status');
  return res.json() as Promise<MaintenanceStatusResponse>;
}

export function MaintenanceBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['maintenance-status'], queryFn: fetchStatus, refetchInterval: 60_000 });
  const status = query.data?.data;
  const window = status?.window;
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;

  useEffect(() => {
    if (status?.active && window?.mode === 'down' && !isSuperAdmin && pathname !== '/maintenance') {
      router.replace('/maintenance');
    }
  }, [isSuperAdmin, pathname, router, status?.active, window?.mode]);

  if (!status?.show_banner || !window || pathname === '/maintenance') return null;

  const tone = window.severity === 'interruption' || window.mode === 'down'
    ? 'bg-red-700 text-white'
    : 'bg-amber-500 text-stone-950';

  return (
    <div className={`${tone} sticky top-0 z-50 px-4 py-2 text-sm shadow-sm`}>
      <div className="mx-auto flex max-w-7xl items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <p>
          {window.messages.fr}
          {' '}
          <span className="font-medium">
            {new Date(window.starts_at).toLocaleString('fr-SN')} - {new Date(window.ends_at).toLocaleString('fr-SN')}
          </span>
        </p>
      </div>
    </div>
  );
}
