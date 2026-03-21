-- Portal Licita-E: schema inicial
create extension if not exists "pgcrypto";

create table if not exists public.bid_filters (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  cnae_code text,
  target_audience text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  pncp_id text unique,
  title text not null,
  description text,
  organization_name text,
  source text not null default 'PNCP',
  source_url text,
  modality text,
  published_date timestamptz not null,
  closing_date timestamptz,
  status text not null default 'em_analise',
  ia_analysis_summary text,
  ia_is_viable boolean,
  ia_deliverables jsonb,
  is_favorite boolean not null default false,
  is_rejected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid references public.bids(id) on delete set null,
  name text not null,
  file_url text not null,
  file_type text,
  expiration_date timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bid_id uuid references public.bids(id) on delete cascade,
  channel text not null default 'email',
  email_notifications boolean not null default true,
  message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.company_cnae (
  id uuid primary key default gen_random_uuid(),
  cnae_code text not null unique,
  cnae_description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date timestamptz not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bids_published_date on public.bids (published_date desc);
create index if not exists idx_bids_status on public.bids (status);
create index if not exists idx_documents_expiration_date on public.documents (expiration_date);
create index if not exists idx_bid_filters_active on public.bid_filters (is_active);
create index if not exists idx_manual_alerts_user_event on public.manual_alerts (user_id, event_date);
create unique index if not exists idx_notifications_unique_user on public.notifications (user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bids_set_updated_at on public.bids;
create trigger trg_bids_set_updated_at
before update on public.bids
for each row
execute function public.set_updated_at();

insert into public.bid_filters (keyword, cnae_code, target_audience)
values
  ('Processos Participativos', '7320-3/00', 'Prefeituras'),
  ('Consulta Livre Previa e Informada', '5811-5/00', 'Governos Estaduais'),
  ('CLPI', '7220-7/00', 'Organismos Internacionais'),
  ('Povos e Comunidades Tradicionais', '7490-1/99', 'ONGs'),
  ('Mediacao de Conflitos Socioambientais', '8599-6/04', 'Prefeituras'),
  ('Diagnostico Socioambiental', '8650-0/03', 'Governos Estaduais'),
  ('Planejamento Territorial e Urbano', '7320-3/00', 'Prefeituras'),
  ('Facilitacao de Oficinas', '5811-5/00', 'ONGs'),
  ('Mapeamento de Quilombolas/Indigenas', '7220-7/00', 'Organismos Internacionais')
on conflict do nothing;

alter table public.bid_filters enable row level security;
alter table public.bids enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.company_cnae enable row level security;
alter table public.manual_alerts enable row level security;

drop policy if exists "authenticated can read bid_filters" on public.bid_filters;
create policy "authenticated can read bid_filters"
on public.bid_filters for select
to authenticated
using (true);

drop policy if exists "authenticated can manage bid_filters" on public.bid_filters;
create policy "authenticated can manage bid_filters"
on public.bid_filters for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can manage bids" on public.bids;
create policy "authenticated can manage bids"
on public.bids for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can manage own notifications" on public.notifications;
create policy "authenticated can manage own notifications"
on public.notifications for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated can manage documents" on public.documents;
create policy "authenticated can manage documents"
on public.documents for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can read company cnaes" on public.company_cnae;
create policy "authenticated can read company cnaes"
on public.company_cnae for select
to authenticated
using (true);

drop policy if exists "authenticated can manage company cnaes" on public.company_cnae;
create policy "authenticated can manage company cnaes"
on public.company_cnae for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can manage own manual alerts" on public.manual_alerts;
create policy "authenticated can manage own manual alerts"
on public.manual_alerts for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists "authenticated can upload documents bucket" on storage.objects;
create policy "authenticated can upload documents bucket"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documents');

drop policy if exists "authenticated can read documents bucket" on storage.objects;
create policy "authenticated can read documents bucket"
on storage.objects for select
to authenticated
using (bucket_id = 'documents');

drop policy if exists "authenticated can update own documents bucket" on storage.objects;
create policy "authenticated can update own documents bucket"
on storage.objects for update
to authenticated
using (bucket_id = 'documents' and owner = auth.uid())
with check (bucket_id = 'documents' and owner = auth.uid());

drop policy if exists "authenticated can delete own documents bucket" on storage.objects;
create policy "authenticated can delete own documents bucket"
on storage.objects for delete
to authenticated
using (bucket_id = 'documents' and owner = auth.uid());
