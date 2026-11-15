import { Switch } from 'takussan';

export function SettingRows() {
  return (
    <div className="max-w-sm divide-y divide-border rounded-xl border border-border bg-card">
      <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-corps">
        Rappels de visite
        <Switch defaultChecked />
      </label>
      <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-corps">
        Synchroniser l’agenda
        <Switch />
      </label>
    </div>
  );
}
