import { useTranslations } from 'next-intl';
import { FileText, Download, FileImage, FileSpreadsheet, File as FileIcon } from 'lucide-react';
import type { PropertyDocument } from '@/types/property';

interface PropertyDocumentsProps {
  documents: PropertyDocument[];
}

function getIcon(type: string): React.ComponentType<{ className?: string }> {
  const t = type.toLowerCase();
  if (t.includes('pdf')) return FileText;
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg')) return FileImage;
  if (t.includes('sheet') || t.includes('xls') || t.includes('csv')) return FileSpreadsheet;
  return FileIcon;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function PropertyDocuments({ documents }: PropertyDocumentsProps) {
  const t = useTranslations('property.detail');
  const publicDocs = documents.filter((d) => d.public);

  if (publicDocs.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-stone-900">{t('documents')}</h2>
      <ul className="space-y-2">
        {publicDocs.map((doc) => {
          const Icon = getIcon(doc.type);
          return (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2.5"
            >
              <Icon className="size-5 text-stone-500 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{doc.name}</p>
                <p className="text-xs text-stone-500">{formatSize(doc.size)}</p>
              </div>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-2.5 h-8 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors shrink-0"
                aria-label={t('downloadAria', { name: doc.name })}
              >
                <Download className="size-3.5" aria-hidden />
                {t('download')}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
