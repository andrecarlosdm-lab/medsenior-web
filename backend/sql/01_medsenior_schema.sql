create extension if not exists pgcrypto;

create schema if not exists app;

create type app.user_role as enum ('prestador', 'operadora', 'auditoria', 'lideranca');
create type app.status_type as enum ('PENDENTE', 'TRATATIVA', 'FINALIZADO', 'CANCELADO', 'PLANTAO', 'AUDITORIA');
create type app.priority_type as enum ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');
create type app.message_channel as enum ('public', 'audit');
create type app.active_status as enum ('ATIVO', 'INATIVO');

create table if not exists app.providers (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) unique,
  name varchar(160) not null,
  cnpj varchar(20) unique,
  state varchar(2),
  city varchar(120),
  contact_name varchar(160),
  contact_phone varchar(40),
  contact_email varchar(160),
  status app.active_status not null default 'ATIVO',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.users (
  id uuid primary key default gen_random_uuid(),
  full_name varchar(160) not null,
  username varchar(80) not null unique,
  password_hash text not null,
  role app.user_role not null,
  status app.active_status not null default 'ATIVO',
  provider_id uuid references app.providers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_required_for_prestador check (
    (role = 'prestador' and provider_id is not null)
    or (role <> 'prestador')
  )
);

create table if not exists app.records (
  id uuid primary key default gen_random_uuid(),
  protocol varchar(60) not null unique,
  state varchar(20),
  observation varchar(255),
  waiting_assumption boolean not null default false,
  carencia varchar(120),
  cpt varchar(120),
  adhesion_date date,
  patient_name varchar(200) not null,
  plan_type varchar(120),
  age varchar(20),
  request_type varchar(200),
  solicitation text,
  emergency_type varchar(120),
  has_opme varchar(20),
  provider_id uuid references app.providers(id) on delete set null,
  companion varchar(160),
  contact varchar(160),
  provider_attends_plan varchar(20),
  assist_reg varchar(120),
  origin_name varchar(180),
  origin_address varchar(255),
  destination_name varchar(180),
  destination_address varchar(255),
  status app.status_type not null default 'PENDENTE',
  priority app.priority_type not null default 'NORMAL',
  created_by uuid references app.users(id) on delete set null,
  assigned_to uuid references app.users(id) on delete set null,
  audit_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.record_messages (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references app.records(id) on delete cascade,
  channel app.message_channel not null,
  author_user_id uuid not null references app.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists app.record_infos (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references app.records(id) on delete cascade,
  info_text text not null,
  updated_by uuid not null references app.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists app.attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references app.records(id) on delete cascade,
  file_name varchar(255) not null,
  file_url text not null,
  file_type varchar(120),
  storage_provider varchar(40) default 'supabase-storage',
  bucket_name varchar(120) default 'medsenior-anexos',
  storage_path text,
  file_size bigint default 0,
  file_ext varchar(20),
  uploaded_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table app.attachments add column if not exists bucket_name varchar(120) default 'medsenior-anexos';
alter table app.attachments add column if not exists storage_path text;
alter table app.attachments add column if not exists file_size bigint default 0;
alter table app.attachments add column if not exists file_ext varchar(20);

create table if not exists app.audit_queue (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references app.records(id) on delete cascade,
  requested_by uuid references app.users(id) on delete set null,
  assigned_auditor uuid references app.users(id) on delete set null,
  queue_status app.status_type not null default 'AUDITORIA',
  deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_records_status on app.records(status);
create index if not exists idx_records_provider on app.records(provider_id);
create index if not exists idx_records_updated_at on app.records(updated_at desc);
create index if not exists idx_messages_record_channel on app.record_messages(record_id, channel, created_at);
create index if not exists idx_record_infos_record on app.record_infos(record_id, updated_at desc);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_providers_updated_at
before update on app.providers
for each row
execute function app.set_updated_at();

create or replace trigger trg_users_updated_at
before update on app.users
for each row
execute function app.set_updated_at();

create or replace trigger trg_records_updated_at
before update on app.records
for each row
execute function app.set_updated_at();

create or replace trigger trg_audit_queue_updated_at
before update on app.audit_queue
for each row
execute function app.set_updated_at();

create or replace view app.v_records_dashboard as
select
  r.id,
  r.protocol,
  r.patient_name,
  r.status,
  r.priority,
  r.created_at,
  r.updated_at,
  r.audit_deadline_at,
  p.name as provider_name,
  u.full_name as created_by_name,
  a.full_name as assigned_to_name,
  case when upper(coalesce(r.emergency_type, '')) in ('SIM', 'EMERGENCIA', 'URGENTE') then true else false end as is_emergency
from app.records r
left join app.providers p on p.id = r.provider_id
left join app.users u on u.id = r.created_by
left join app.users a on a.id = r.assigned_to;


-- Supabase Storage: bucket privado para anexos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medsenior-anexos',
  'medsenior-anexos',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
