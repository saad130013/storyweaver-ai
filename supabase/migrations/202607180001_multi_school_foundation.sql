-- StoryWeaver AI multi-school database foundation
-- Apply with: supabase db push

create extension if not exists pgcrypto;

create type public.school_role as enum ('school_admin', 'teacher', 'student');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.school_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);
create index school_memberships_user_idx on public.school_memberships(user_id, school_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  grade text,
  academic_year text not null,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name, academic_year)
);
create index classes_school_idx on public.classes(school_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_user_id uuid unique references public.profiles(user_id) on delete set null,
  student_number text,
  display_name text not null,
  grade text,
  login_enabled boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (school_id, student_number),
  constraint enabled_login_requires_account check (not login_enabled or profile_user_id is not null)
);
create index students_school_idx on public.students(school_id);

create table public.teacher_assignments (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(user_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (class_id, teacher_user_id)
);

create table public.class_enrollments (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  created_by uuid not null references public.profiles(user_id),
  title text not null default 'قصة جديدة',
  language_mode text not null default 'bilingual' check (language_mode in ('ar', 'bilingual')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  grade_snapshot text,
  school_name_snapshot text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stories_school_student_idx on public.stories(school_id, student_id);
create index stories_creator_idx on public.stories(created_by);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  position integer not null check (position >= 0),
  narrative text not null default '',
  dialogue text not null default '',
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, position)
);

create table public.scene_media (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'audio')),
  storage_path text not null,
  mime_type text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (scene_id, media_type, position)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete set null,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_school_created_idx on public.audit_logs(school_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_updated_at before update on public.schools
for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger classes_updated_at before update on public.classes
for each row execute function public.set_updated_at();
create trigger students_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger stories_updated_at before update on public.stories
for each row execute function public.set_updated_at();
create trigger scenes_updated_at before update on public.scenes
for each row execute function public.set_updated_at();

create or replace function public.is_system_admin()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'system_admin', false);
$$;

create or replace function public.has_school_role(target_school uuid, allowed_roles public.school_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1 from public.school_memberships m
    where m.school_id = target_school
      and m.user_id = auth.uid()
      and m.is_active
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.can_access_student(target_student uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = target_student
      and (
        public.has_school_role(s.school_id, array['school_admin']::public.school_role[])
        or (s.login_enabled and s.profile_user_id = auth.uid())
        or exists (
          select 1
          from public.class_enrollments ce
          join public.teacher_assignments ta on ta.class_id = ce.class_id
          where ce.student_id = s.id and ta.teacher_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_access_story(target_story uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stories st
    where st.id = target_story
      and (
        public.has_school_role(st.school_id, array['school_admin']::public.school_role[])
        or st.created_by = auth.uid()
        or (st.student_id is not null and public.can_access_student(st.student_id))
      )
  );
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.stories enable row level security;
alter table public.scenes enable row level security;
alter table public.scene_media enable row level security;
alter table public.audit_logs enable row level security;

create policy schools_read on public.schools for select
using (public.has_school_role(id, array['school_admin','teacher','student']::public.school_role[]));
create policy schools_admin_write on public.schools for update
using (public.has_school_role(id, array['school_admin']::public.school_role[]))
with check (public.has_school_role(id, array['school_admin']::public.school_role[]));

create policy profiles_self_read on public.profiles for select using (user_id = auth.uid() or public.is_system_admin());
create policy profiles_self_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy memberships_read on public.school_memberships for select
using (user_id = auth.uid() or public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy memberships_admin_insert on public.school_memberships for insert
with check (public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy memberships_admin_update on public.school_memberships for update
using (public.has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy memberships_admin_delete on public.school_memberships for delete
using (public.has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy classes_read on public.classes for select
using (public.has_school_role(school_id, array['school_admin','teacher','student']::public.school_role[]));
create policy classes_admin_write on public.classes for all
using (public.has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy students_read on public.students for select using (public.can_access_student(id));
create policy students_admin_insert on public.students for insert
with check (public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy students_admin_update on public.students for update
using (public.has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy students_admin_delete on public.students for delete
using (public.has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy teacher_assignments_read on public.teacher_assignments for select
using (teacher_user_id = auth.uid() or exists (
  select 1 from public.classes c where c.id = class_id
  and public.has_school_role(c.school_id, array['school_admin']::public.school_role[])
));
create policy teacher_assignments_admin_write on public.teacher_assignments for all
using (exists (select 1 from public.classes c where c.id = class_id and public.has_school_role(c.school_id, array['school_admin']::public.school_role[])))
with check (exists (select 1 from public.classes c where c.id = class_id and public.has_school_role(c.school_id, array['school_admin']::public.school_role[])));

create policy enrollments_read on public.class_enrollments for select
using (public.can_access_student(student_id));
create policy enrollments_admin_write on public.class_enrollments for all
using (exists (
  select 1 from public.classes c where c.id = class_id
  and public.has_school_role(c.school_id, array['school_admin']::public.school_role[])
))
with check (exists (
  select 1 from public.classes c where c.id = class_id
  and public.has_school_role(c.school_id, array['school_admin']::public.school_role[])
));

create policy stories_read on public.stories for select using (public.can_access_story(id));
create policy stories_insert on public.stories for insert
with check (
  created_by = auth.uid()
  and public.has_school_role(school_id, array['school_admin','teacher','student']::public.school_role[])
  and (student_id is null or public.can_access_student(student_id))
);
create policy stories_update on public.stories for update
using (public.can_access_story(id))
with check (public.can_access_story(id));
create policy stories_delete on public.stories for delete
using (created_by = auth.uid() or public.has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy scenes_read on public.scenes for select using (public.can_access_story(story_id));
create policy scenes_write on public.scenes for all
using (public.can_access_story(story_id))
with check (public.can_access_story(story_id));

create policy scene_media_read on public.scene_media for select
using (exists (select 1 from public.scenes s where s.id = scene_id and public.can_access_story(s.story_id)));
create policy scene_media_write on public.scene_media for all
using (exists (select 1 from public.scenes s where s.id = scene_id and public.can_access_story(s.story_id)))
with check (exists (select 1 from public.scenes s where s.id = scene_id and public.can_access_story(s.story_id)));

create policy audit_admin_read on public.audit_logs for select
using (school_id is not null and public.has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy audit_authenticated_insert on public.audit_logs for insert
with check (actor_user_id = auth.uid() and school_id is not null
  and public.has_school_role(school_id, array['school_admin','teacher','student']::public.school_role[]));

insert into storage.buckets (id, name, public)
values ('story-media', 'story-media', false)
on conflict (id) do update set public = false;

create policy story_media_read on storage.objects for select
using (
  bucket_id = 'story-media'
  and public.has_school_role(
    ((storage.foldername(name))[1])::uuid,
    array['school_admin','teacher','student']::public.school_role[]
  )
);
create policy story_media_insert on storage.objects for insert
with check (
  bucket_id = 'story-media'
  and public.has_school_role(
    ((storage.foldername(name))[1])::uuid,
    array['school_admin','teacher','student']::public.school_role[]
  )
);
create policy story_media_update on storage.objects for update
using (
  bucket_id = 'story-media'
  and owner_id = auth.uid()::text
);
create policy story_media_delete on storage.objects for delete
using (
  bucket_id = 'story-media'
  and (
    owner_id = auth.uid()::text
    or public.has_school_role(
      ((storage.foldername(name))[1])::uuid,
      array['school_admin']::public.school_role[]
    )
  )
);

comment on table public.school_memberships is 'A user may belong to multiple schools with one role per school.';
comment on column public.students.login_enabled is 'When false, teachers/admins manage the student profile without student authentication.';
comment on column public.scene_media.storage_path is 'Private storage path: <school_id>/<story_id>/<scene_id>/<filename>.';
