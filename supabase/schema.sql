-- supabase/schema.sql — run once in Supabase Dashboard > SQL Editor
create table if not exists public.detection_logs (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  source          text        not null,               -- webcam | upload | simulasi | cctv
  engine          text,                               -- server (FastAPI) | browser (onnxruntime-web)
  model           text,
  inference_ms    real,
  items           jsonb       not null default '[]',  -- [{category, confidence, bbox:[x1,y1,x2,y2]}]
  total_items     int         not null default 0,
  total_weight_kg numeric(10,3) not null default 0,
  total_value_idr int         not null default 0,
  points          int         not null default 0,
  snapshot        text                                -- small JPEG data URL = visual evidence
);

create index if not exists detection_logs_created_at_idx on public.detection_logs (created_at desc);

-- RLS on, no public policies: only the server (service_role key in Vercel env) can read/write.
alter table public.detection_logs enable row level security;
