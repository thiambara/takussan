'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { AppTopbar } from './AppTopbar';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <AppTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <AppSidebar user={user} />
        </div>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0">
            <AppSidebar user={user} onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex-1 overflow-y-auto bg-app-bg">
          <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
