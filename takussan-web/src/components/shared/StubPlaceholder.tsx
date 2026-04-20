import { Construction } from 'lucide-react';

interface StubPlaceholderProps {
  label: string;
  description?: string;
}

export function StubPlaceholder({ label, description }: StubPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#fcf2eb] p-12 text-center">
      <Construction className="size-10 text-[#7d5630]" />
      <p className="text-sm font-semibold text-[#1f1b17]">En cours de développement</p>
      <p className="text-xs text-[#43474e]">{description ?? label}</p>
    </div>
  );
}
