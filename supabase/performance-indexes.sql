-- Supabase performance package for current runtime schema.
-- Safe to run multiple times.

-- restaurants
do $$
begin
  if to_regclass('public.restaurants') is not null then
    execute 'create index if not exists restaurants_is_active_name_idx on public.restaurants (is_active, name)';
    execute 'create index if not exists restaurants_slug_idx on public.restaurants (slug)';
  end if;
end $$;

-- restaurant_tables
do $$
begin
  if to_regclass('public.restaurant_tables') is not null then
    execute 'create index if not exists restaurant_tables_restaurant_active_number_idx on public.restaurant_tables (restaurant_id, is_active, table_number)';
    execute 'create index if not exists restaurant_tables_active_number_idx on public.restaurant_tables (is_active, table_number)';
    execute 'create index if not exists restaurant_tables_access_token_idx on public.restaurant_tables (access_token)';
  end if;
end $$;

-- restaurant_settings
do $$
begin
  if to_regclass('public.restaurant_settings') is not null then
    execute 'create index if not exists restaurant_settings_restaurant_id_idx on public.restaurant_settings (restaurant_id)';
  end if;
end $$;

-- orders (new storage)
do $$
begin
  if to_regclass('public.orders') is not null then
    execute 'create index if not exists orders_created_at_idx on public.orders (created_at desc)';
    execute 'create index if not exists orders_restaurant_table_session_idx on public.orders (restaurant_id, table_number, session_id)';
    execute 'create index if not exists orders_restaurant_status_created_idx on public.orders (restaurant_id, status, created_at desc)';
    execute 'create index if not exists orders_table_id_idx on public.orders (table_id)';
    execute 'create index if not exists orders_table_status_created_idx on public.orders (table_id, status, created_at desc)';
  end if;
end $$;

-- order_items (new storage)
do $$
begin
  if to_regclass('public.order_items') is not null then
    execute 'create index if not exists order_items_order_id_idx on public.order_items (order_id)';
    execute 'create index if not exists order_items_restaurant_order_idx on public.order_items (restaurant_id, order_id)';
  end if;
end $$;

-- service_requests
do $$
begin
  if to_regclass('public.service_requests') is not null then
    execute 'create index if not exists service_requests_created_at_idx on public.service_requests (created_at desc)';
    execute 'create index if not exists service_requests_restaurant_table_session_status_idx on public.service_requests (restaurant_id, table_number, session_id, status)';
  end if;
end $$;

-- closed_sessions
do $$
begin
  if to_regclass('public.closed_sessions') is not null then
    execute 'create index if not exists closed_sessions_closed_at_idx on public.closed_sessions (closed_at desc)';
    execute 'create index if not exists closed_sessions_restaurant_closed_idx on public.closed_sessions (restaurant_id, closed_at desc)';
    execute 'create index if not exists closed_sessions_restaurant_table_session_idx on public.closed_sessions (restaurant_id, table_number, session_id)';
  end if;
end $$;

-- restaurant_table_sessions
do $$
begin
  if to_regclass('public.restaurant_table_sessions') is not null then
    execute 'create index if not exists restaurant_table_sessions_restaurant_table_idx on public.restaurant_table_sessions (restaurant_id, table_number)';
  end if;
end $$;

-- legacy row storage (if still used)
do $$
begin
  if to_regclass('public.orders_store') is not null then
    execute 'create index if not exists orders_store_created_at_idx on public.orders_store (created_at desc)';
    execute 'create index if not exists orders_store_restaurant_table_session_idx on public.orders_store (restaurant_slug, table_number, session_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.order_items_store') is not null then
    execute 'create index if not exists order_items_store_order_id_idx on public.order_items_store (order_id)';
  end if;
end $$;

-- app_state
do $$
begin
  if to_regclass('public.app_state') is not null then
    execute 'create index if not exists app_state_key_idx on public.app_state (key)';
  end if;
end $$;

-- refresh planner statistics after index creation
analyze;
