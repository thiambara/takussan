export interface PropertyReview {
  id: number;
  rating: number;
  title: string | null;
  content: string | null;
  author: { id: number; name: string; avatar_url: string | null };
  reply_content: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface PropertyReviewsResponse {
  data: PropertyReview[];
  meta: {
    total: number;
    current_page: number;
    average: number | null;
    distribution: Record<'5' | '4' | '3' | '2' | '1', number>;
  };
}
