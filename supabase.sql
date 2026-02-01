-- Table for records that have been manually processed.
create extension if not exists "pgcrypto";

-- Table for imported billing records.
create table if not exists public.billing_records (
  account_no text primary key,
  name text,
  phone text,
  address text,
  arrears numeric,
  current_fee numeric,
  total_fee numeric,
  asked boolean default false,
  source_file text,
  imported_at timestamptz default now()
);

create table if not exists public.processed_accounts (
  id uuid primary key default gen_random_uuid(),
  account_no text unique not null,
  name text,
  phone text,
  address text,
  note text,
  processed_at timestamptz default now()
);

alter table public.processed_accounts enable row level security;
alter table public.billing_records enable row level security;

create policy "public read billing records" on public.billing_records
  for select using (true);

create policy "public insert billing records" on public.billing_records
  for insert with check (true);

create policy "public update billing records" on public.billing_records
  for update using (true);

create policy "public delete billing records" on public.billing_records
  for delete using (true);

create policy "public read" on public.processed_accounts
  for select using (true);

create policy "public insert" on public.processed_accounts
  for insert with check (true);

create policy "public update" on public.processed_accounts
  for update using (true);

create policy "public delete" on public.processed_accounts
  for delete using (true);
