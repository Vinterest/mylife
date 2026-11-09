export interface Env {
  DB: D1Database;
  AI: Ai;
  OWNER_EMAIL: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  WORKERS_AI_MODEL: string;
  GEMINI_DAILY_REQUESTS: string;
  WORKERS_AI_DAILY_NEURONS: string;
  QUOTA_STOP_RATIO: string;
  /** Vòng 1 dùng mỗi key tới tỷ lệ này rồi chuyển key (mặc định 0.5). */
  QUOTA_ROUND_RATIO?: string;
  DEV_SKIP_AUTH: string;
  // Chặng 2 · dịch máy dự phòng (để trống = bỏ qua dịch vụ đó)
  AZURE_TRANSLATOR_KEY?: string;
  AZURE_TRANSLATOR_REGION?: string;
  DEEPL_API_KEY?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;
  // Chặng 4 · giọng đọc Google Cloud Text-to-Speech
  GOOGLE_TTS_API_KEY?: string;
  /** Chỉ dùng khi chạy local: giả lập bản dịch. */
  DEV_FAKE_TRANSLATE?: string;
}

export type Channel = 'ai' | 'embodied' | 'robotics' | 'tcnh';

export interface SourceRow {
  id: string;
  name: string;
  kind: 'arxiv' | 'rss' | 'sitemap' | 'html' | 'manual';
  url: string;
  channel: Channel;
  weight: number;
  keywords: string | null;
  enabled: number;
  last_run_at: string | null;
  last_error: string | null;
  item_count: number;
}

export interface ItemRow {
  id: number;
  source_id: string;
  channel: Channel;
  url: string;
  title_key: string;
  title_en: string;
  title_vi: string | null;
  authors: string | null;
  published_at: string;
  fetched_at: string;
  abstract_en: string | null;
  summary_vi: string | null;
  points_vi: string | null;
  why_vi: string | null;
  score: number;
  status: 'new' | 'summarized' | 'waiting_quota' | 'failed';
  engine: string | null;
  attempts: number;
  read_minutes: number | null;
  image_url: string | null;
  read_at: string | null;
  note?: string | null;
  kept: number;
  dismissed: number;
  source_name?: string;
  source_weight?: number;
}

/** Bài vừa lấy từ nguồn, chưa lưu. */
export interface RawItem {
  url: string;
  title: string;
  authors?: string;
  published: Date;
  abstract: string;
  /** Ảnh đại diện lấy từ feed (nếu có). */
  image?: string;
  isPaper: boolean;
}
