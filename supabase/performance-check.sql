-- Quick post-index health checks

-- 1) row counts by core tables
select 'orders' as table_name, count(*)::bigint as rows from public.orders
union all
select 'order_items', count(*)::bigint from public.order_items
union all
select 'service_requests', count(*)::bigint from public.service_requests
union all
select 'closed_sessions', count(*)::bigint from public.closed_sessions
union all
select 'restaurant_tables', count(*)::bigint from public.restaurant_tables;

-- 2) list indexes on hot tables
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'restaurants',
    'restaurant_tables',
    'restaurant_settings',
    'orders',
    'order_items',
    'service_requests',
    'closed_sessions',
    'restaurant_table_sessions',
    'orders_store',
    'order_items_store',
    'app_state'
  )
order by tablename, indexname;

-- 3) check potential seq scans on hot tables
select
  relname as table_name,
  seq_scan,
  idx_scan,
  n_tup_ins,
  n_tup_upd,
  n_tup_del
from pg_stat_user_tables
where schemaname = 'public'
  and relname in (
    'orders',
    'order_items',
    'service_requests',
    'closed_sessions',
    'restaurant_tables'
  )
order by relname;

