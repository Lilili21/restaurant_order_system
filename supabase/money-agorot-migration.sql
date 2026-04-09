begin;

-- 1) Ensure decimal compatibility on legacy shekel columns (fixes integer-column breakages).
alter table if exists public.orders
  alter column total type numeric(12,2) using round(coalesce(total, 0)::numeric, 2);

alter table if exists public.order_items
  alter column price type numeric(12,2) using round(coalesce(price, 0)::numeric, 2);

alter table if exists public.closed_sessions
  alter column total type numeric(12,2) using round(coalesce(total, 0)::numeric, 2);

alter table if exists public.orders_store
  alter column total type numeric(12,2) using round(coalesce(total, 0)::numeric, 2);

alter table if exists public.order_items_store
  alter column price type numeric(12,2) using round(coalesce(price, 0)::numeric, 2);

alter table if exists public.menu_items
  alter column price type numeric(12,2) using round(coalesce(price, 0)::numeric, 2);

-- 2) Add canonical minor-unit columns.
alter table if exists public.orders
  add column if not exists total_agorot bigint;

alter table if exists public.order_items
  add column if not exists price_agorot integer;

alter table if exists public.closed_sessions
  add column if not exists total_agorot bigint;

alter table if exists public.orders_store
  add column if not exists total_agorot bigint;

alter table if exists public.order_items_store
  add column if not exists price_agorot integer;

alter table if exists public.menu_items
  add column if not exists price_agorot integer;

-- 3) Backfill agorot from shekel columns.
update public.orders
set total_agorot = round(coalesce(total, 0) * 100)::bigint
where total_agorot is null;

update public.order_items
set price_agorot = round(coalesce(price, 0) * 100)::integer
where price_agorot is null;

update public.closed_sessions
set total_agorot = round(coalesce(total, 0) * 100)::bigint
where total_agorot is null;

update public.orders_store
set total_agorot = round(coalesce(total, 0) * 100)::bigint
where total_agorot is null;

update public.order_items_store
set price_agorot = round(coalesce(price, 0) * 100)::integer
where price_agorot is null;

update public.menu_items
set price_agorot = round(coalesce(price, 0) * 100)::integer
where price_agorot is null;

-- 4) Enforce non-negative constraints and defaults for new canonical columns.
alter table if exists public.orders
  alter column total_agorot set default 0,
  alter column total_agorot set not null;

alter table if exists public.order_items
  alter column price_agorot set default 0,
  alter column price_agorot set not null;

alter table if exists public.closed_sessions
  alter column total_agorot set default 0,
  alter column total_agorot set not null;

alter table if exists public.orders_store
  alter column total_agorot set default 0,
  alter column total_agorot set not null;

alter table if exists public.order_items_store
  alter column price_agorot set default 0,
  alter column price_agorot set not null;

alter table if exists public.menu_items
  alter column price_agorot set default 0,
  alter column price_agorot set not null;

alter table if exists public.orders
  drop constraint if exists orders_total_agorot_non_negative;
alter table if exists public.orders
  add constraint orders_total_agorot_non_negative check (total_agorot >= 0);

alter table if exists public.order_items
  drop constraint if exists order_items_price_agorot_non_negative;
alter table if exists public.order_items
  add constraint order_items_price_agorot_non_negative check (price_agorot >= 0);

alter table if exists public.closed_sessions
  drop constraint if exists closed_sessions_total_agorot_non_negative;
alter table if exists public.closed_sessions
  add constraint closed_sessions_total_agorot_non_negative check (total_agorot >= 0);

alter table if exists public.orders_store
  drop constraint if exists orders_store_total_agorot_non_negative;
alter table if exists public.orders_store
  add constraint orders_store_total_agorot_non_negative check (total_agorot >= 0);

alter table if exists public.order_items_store
  drop constraint if exists order_items_store_price_agorot_non_negative;
alter table if exists public.order_items_store
  add constraint order_items_store_price_agorot_non_negative check (price_agorot >= 0);

alter table if exists public.menu_items
  drop constraint if exists menu_items_price_agorot_non_negative;
alter table if exists public.menu_items
  add constraint menu_items_price_agorot_non_negative check (price_agorot >= 0);

commit;
