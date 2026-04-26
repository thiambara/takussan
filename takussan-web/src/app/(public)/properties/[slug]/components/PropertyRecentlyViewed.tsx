'use client';

import { RecentlyViewedCarousel } from '@/components/property/RecentlyViewedCarousel';

interface PropertyRecentlyViewedProps {
  excludeId: number;
}

export function PropertyRecentlyViewed({ excludeId }: PropertyRecentlyViewedProps) {
  return <RecentlyViewedCarousel excludeId={excludeId} />;
}
