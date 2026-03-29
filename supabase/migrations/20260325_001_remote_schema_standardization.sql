-- Remote production standardization for direct PNCP identifiers
-- Idempotent migration

alter table public.bids add column if not exists municipio_orgao text;
alter table public.bids add column if not exists orgao_cnpj text;
alter table public.bids add column if not exists edital_ano text;
alter table public.bids add column if not exists edital_sequencial text;
alter table public.bids add column if not exists is_link_valid boolean;
alter table public.bids add column if not exists link_http_status integer;
alter table public.bids add column if not exists link_validation_error text;
alter table public.bids add column if not exists link_checked_at timestamptz;
alter table public.bids add column if not exists source_system text;
alter table public.bids add column if not exists source_priority integer;
alter table public.bids add column if not exists score_esa integer;
alter table public.bids add column if not exists ia_relevance_status text;
alter table public.bids add column if not exists pdf_text_length integer;
alter table public.bids add column if not exists pdf_terms_found text[];

create index if not exists idx_bids_edital_identifiers
  on public.bids (orgao_cnpj, edital_ano, edital_sequencial);

create index if not exists idx_bids_link_valid
  on public.bids (is_link_valid);

create index if not exists idx_bids_source_priority
  on public.bids (source_priority, published_date desc);
