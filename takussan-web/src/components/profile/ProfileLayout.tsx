interface ProfileLayoutProps {
  children: React.ReactNode;
}

export function ProfileLayout({ children }: ProfileLayoutProps) {
  return <div className="mx-auto max-w-2xl space-y-8">{children}</div>;
}
