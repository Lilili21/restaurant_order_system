create table if not exists public.orders_store (
  order_id text primary key,
  restaurant_slug text not null,
  restaurant_name text not null,
  table_number integer not null,
  session_id integer not null,
  kind text not null default 'order',
  serve_mode text,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz,
  total numeric(10,2) not null default 0
);

create index if not exists orders_store_restaurant_table_idx
  on public.orders_store (restaurant_slug, table_number, session_id);

create index if not exists orders_store_created_at_idx
  on public.orders_store (created_at desc);

create table if not exists public.order_items_store (
  id text primary key,
  order_id text not null references public.orders_store(order_id) on delete cascade,
  menu_item_id text not null,
  category text,
  name text not null,
  volume_option_id text,
  volume_label text,
  price numeric(10,2) not null,
  quantity integer not null check (quantity > 0),
  note text,
  served boolean not null default false
);

create index if not exists order_items_store_order_id_idx
  on public.order_items_store (order_id);
