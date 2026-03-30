-- Add portal origin metadata used by multi-source sync
alter table public.bids add column if not exists portal_origin text;
