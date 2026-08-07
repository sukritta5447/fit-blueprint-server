create or replace function private.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_app_meta_data ->> 'role', 'member');
  requested_status text := coalesce(
    new.raw_app_meta_data ->> 'account_status',
    'active'
  );
begin
  if requested_role not in (
    'member',
    'content_admin',
    'support_admin',
    'super_admin'
  ) then
    requested_role := 'member';
  end if;

  if requested_status not in ('active', 'paused', 'disabled') then
    requested_status := 'active';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    username,
    avatar_url,
    role,
    status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'image',
          ''
        )
      ),
      ''
    ),
    requested_role,
    requested_status
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

create or replace function private.notify_admins_of_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, title, body)
  select profiles.id, new.id, 'signup', 'New member signup',
    coalesce(nullif(btrim(new.full_name), ''), new.email)
  from public.profiles
  where profiles.role in ('content_admin', 'support_admin', 'super_admin');

  return new;
exception
  when others then
    raise warning 'Could not create signup notifications: %', sqlerrm;
    return new;
end;
$$;
