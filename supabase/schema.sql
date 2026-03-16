create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamp with time zone default now()
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_number integer not null,
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  unique (restaurant_id, table_number)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null,
  image_url text,
  is_available boolean not null default true,
  created_at timestamp with time zone default now()
);

create type order_status as enum (
  'new',
  'in_progress',
  'served',
  'closed',
  'cancelled'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references tables(id) on delete cascade,
  status order_status not null default 'new',
  comment text,
  created_at timestamp with time zone default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid,
  item_name_snapshot text not null,
  item_price_snapshot numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);