import type { Announcement, AnnouncementsResponse } from '@/types/super-admin';
import { ApiError } from '@/lib/api';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

export async function fetchActiveAnnouncements(): Promise<AnnouncementsResponse> {
  const res = await fetch('/api/announcements/active', {
    credentials: 'include',
  });
  return jsonOrThrow<AnnouncementsResponse>(res);
}

export async function dismissAnnouncement(id: number): Promise<{ data: { dismissed: boolean; announcement_id: number } }> {
  const res = await fetch(`/api/announcements/${id}/dismiss`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<{ data: { dismissed: boolean; announcement_id: number } }>(res);
}

export function localizedAnnouncementText(announcement: Announcement, locale = 'fr'): { title: string; body: string } {
  const key = locale === 'en' || locale === 'wo' ? locale : 'fr';
  return {
    title: announcement.title[key] || announcement.title.fr,
    body: announcement.body[key] || announcement.body.fr,
  };
}
