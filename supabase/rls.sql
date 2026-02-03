alter table teams enable row level security;
alter table weekly_scores enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;
alter table balance_history enable row level security;

create policy "public_select_teams"
  on teams for select
  using (true);

create policy "public_select_products"
  on products for select
  using (is_active = true);

create policy "public_insert_orders"
  on orders for insert
  with check (status = 'new');

create view public_settings as
select current_week
from settings
where id = 1;

revoke all on settings from anon, authenticated;
grant select on public_settings to anon, authenticated;
grant select on teams, products to anon, authenticated;
grant insert on orders to anon, authenticated;
