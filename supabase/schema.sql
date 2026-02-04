create extension if not exists "pgcrypto";

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_week_score numeric not null default 0,
  cumulative_score numeric not null default 0,
  tikuns_balance integer not null default 0,
  previous_rank integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists weekly_scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete restrict,
  week_number integer not null,
  score numeric not null,
  uploaded_at timestamptz not null default now(),
  unique (team_id, week_number)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price integer not null,
  category text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  telegram_contact text not null,
  comment text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id integer primary key default 1,
  current_week integer not null default 1
);

create table if not exists balance_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete restrict,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists rating_history (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  payload jsonb not null,
  undone boolean not null default false,
  created_at timestamptz not null default now()
);

alter table weekly_scores
  add constraint weekly_scores_week_check
  check (week_number between 1 and 12);

alter table products
  add constraint products_category_check
  check (category in ('people', 'expertise', 'ads', 'other'));

alter table orders
  add constraint orders_status_check
  check (status in ('new', 'approved', 'rejected', 'completed'));

alter table settings
  add constraint settings_singleton_check
  check (id = 1);

create unique index if not exists weekly_scores_team_week
  on weekly_scores(team_id, week_number);
create index if not exists weekly_scores_week_idx on weekly_scores(week_number);
create index if not exists teams_cumulative_idx on teams(cumulative_score desc);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);
create index if not exists balance_history_team_idx on balance_history(team_id);
create index if not exists rating_history_created_idx on rating_history(created_at desc);

insert into settings (id, current_week)
values (1, 1)
on conflict (id) do nothing;
