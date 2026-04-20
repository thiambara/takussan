'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { AppTopbar } from './AppTopbar';
import { AdminSidebar } from './AdminSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface AdminShellProps {
  user: User;
  children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-[#fff8f5]">
      <AppTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <AdminSidebar user={user} />
        </div>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="bg-[#022448] p-0">
            <AdminSidebar user={user} onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex-1 overflow-y-auto bg-[#fff8f5]">
          <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
