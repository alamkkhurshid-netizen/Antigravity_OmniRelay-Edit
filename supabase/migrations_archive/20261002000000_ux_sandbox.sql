-- Add is_demo flag to organizations
alter table public.organizations add column is_demo boolean not null default false;
