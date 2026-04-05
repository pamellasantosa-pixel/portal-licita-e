-- Garantia de colunas usadas pela Dashboard e serviços de bids.
-- Script idempotente para ser executado em ambientes já existentes.

alter table public.bids
  add column if not exists aderencia_score int4,
  add column if not exists alta_aderencia boolean,
  add column if not exists status text,
  add column if not exists is_favorite boolean,
  add column if not exists is_rejected boolean,
  add column if not exists score_esa int4,
  add column if not exists ia_relevance_status text,
  add column if not exists source_system text,
  add column if not exists source_priority int4,
  add column if not exists orgao_cnpj text,
  add column if not exists link_edital text,
  add column if not exists is_link_valid boolean,
  add column if not exists link_http_status int4,
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_validation_error text,
  add column if not exists pdf_text_length int4,
  add column if not exists pdf_terms_found text[];

alter table public.bids alter column aderencia_score set default 0;
alter table public.bids alter column alta_aderencia set default false;
alter table public.bids alter column status set default 'em_analise';
alter table public.bids alter column is_favorite set default false;
alter table public.bids alter column is_rejected set default false;
alter table public.bids alter column score_esa set default 0;
alter table public.bids alter column source_priority set default 1;

update public.bids
set
  aderencia_score = coalesce(aderencia_score, 0),
  alta_aderencia = coalesce(alta_aderencia, false),
  status = coalesce(nullif(status, ''), 'em_analise'),
  is_favorite = coalesce(is_favorite, false),
  is_rejected = coalesce(is_rejected, false),
  score_esa = coalesce(score_esa, 0),
  source_priority = coalesce(source_priority, 1)
where
  aderencia_score is null
  or alta_aderencia is null
  or status is null
  or status = ''
  or is_favorite is null
  or is_rejected is null
  or score_esa is null
  or source_priority is null;

create index if not exists idx_bids_aderencia_score on public.bids (aderencia_score desc);
create index if not exists idx_bids_alta_aderencia on public.bids (alta_aderencia);
create index if not exists idx_bids_status_dashboard on public.bids (status);
