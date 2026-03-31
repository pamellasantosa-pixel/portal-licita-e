create table if not exists public.source_health (
  source_name text primary key,
  status text not null default 'CLOSED' check (status in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count integer not null default 0,
  last_failure_at timestamptz null,
  last_success_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_health_status on public.source_health (status);

create or replace function public.set_source_health_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_source_health_updated_at on public.source_health;
create trigger trg_source_health_updated_at
before update on public.source_health
for each row
execute function public.set_source_health_updated_at();
