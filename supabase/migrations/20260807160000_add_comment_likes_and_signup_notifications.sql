alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in ('publish', 'comment', 'comment_reply', 'like', 'comment_like', 'signup', 'system')
  );

create table public.comment_likes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index comment_likes_user_id_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

create policy comment_likes_select_own_or_admin
on public.comment_likes for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_is_admin())
);

create policy comment_likes_insert_own
on public.comment_likes for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy comment_likes_delete_own
on public.comment_likes for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, delete on public.comment_likes to authenticated;

create or replace function private.notify_admins_of_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, title, body)
  select profiles.id, new.id, 'signup', 'New member signup',
    coalesce(nullif(btrim(new.full_name), ''), new.email);

  return new;
end;
$$;

revoke execute on function private.notify_admins_of_new_signup() from public;

create trigger notify_admins_after_profile_signup
after insert on public.profiles
for each row
when (new.role = 'member')
execute function private.notify_admins_of_new_signup();
