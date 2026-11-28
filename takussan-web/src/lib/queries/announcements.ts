import type { Announcement, AnnouncementsResponse } from '@/types/super-admin';
import { appelBff } from '@/lib/bff';
import { cheminApi } from '@/lib/chemin-api';

export async function fetchActiveAnnouncements(): Promise<AnnouncementsResponse> {
  return appelBff<AnnouncementsResponse>('/api/announcements/active');
}

export async function dismissAnnouncement(id: number): Promise<{ data: { dismissed: boolean; announcement_id: number } }> {
  return appelBff<{ data: { dismissed: boolean; announcement_id: number } }>(cheminApi`/api/announcements/${id}/dismiss`, { method: 'POST' });
}

export function localizedAnnouncementText(announcement: Announcement, locale = 'fr'): { title: string; body: string } {
  const key = locale === 'en' || locale === 'wo' ? locale : 'fr';
  return {
    title: announcement.title[key] || announcement.title.fr,
    body: announcement.body[key] || announcement.body.fr,
  };
}
