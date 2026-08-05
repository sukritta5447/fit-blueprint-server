drop policy comments_select_visible_anon on public.comments;
drop policy comments_select_authenticated on public.comments;
drop policy comments_insert_own on public.comments;
drop policy comments_update_own_or_admin on public.comments;
drop policy comments_delete_own_or_admin on public.comments;

create policy comments_select_visible_anon
on public.comments for select
to anon
using (
  not is_deleted
  and exists (
    select 1
    from public.posts
    join public.statuses on statuses.id = posts.status_id
    where posts.id = comments.post_id
      and statuses.is_public
  )
);

create policy comments_select_authenticated
on public.comments for select
to authenticated
using (
  (
    not is_deleted
    and exists (
      select 1
      from public.posts
      join public.statuses on statuses.id = posts.status_id
      where posts.id = comments.post_id
        and statuses.is_public
    )
  )
  or author_id = (select auth.uid())
  or (select private.current_user_is_admin())
);

create policy comments_insert_own
on public.comments for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    join public.statuses on statuses.id = posts.status_id
    where posts.id = comments.post_id
      and statuses.is_public
  )
);

create policy comments_update_own_or_admin
on public.comments for update
to authenticated
using (
  (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.posts
      join public.statuses on statuses.id = posts.status_id
      where posts.id = comments.post_id
        and statuses.is_public
    )
  )
  or (select private.current_user_is_admin())
)
with check (
  (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.posts
      join public.statuses on statuses.id = posts.status_id
      where posts.id = comments.post_id
        and statuses.is_public
    )
  )
  or (select private.current_user_is_admin())
);

create policy comments_delete_own_or_admin
on public.comments for delete
to authenticated
using (
  (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.posts
      join public.statuses on statuses.id = posts.status_id
      where posts.id = comments.post_id
        and statuses.is_public
    )
  )
  or (select private.current_user_is_admin())
);

revoke insert, update on public.comments from authenticated;
grant insert (post_id, author_id, parent_id, content)
on public.comments to authenticated;
grant update (content, is_deleted)
on public.comments to authenticated;

drop policy post_likes_select_own_or_admin on public.post_likes;
drop policy post_likes_insert_own on public.post_likes;
drop policy post_likes_delete_own on public.post_likes;

create policy post_likes_select_own_or_admin
on public.post_likes for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.posts
      join public.statuses on statuses.id = posts.status_id
      where posts.id = post_likes.post_id
        and statuses.is_public
    )
  )
  or (select private.current_user_is_admin())
);

create policy post_likes_insert_own
on public.post_likes for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    join public.statuses on statuses.id = posts.status_id
    where posts.id = post_likes.post_id
      and statuses.is_public
  )
);

create policy post_likes_delete_own
on public.post_likes for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    join public.statuses on statuses.id = posts.status_id
    where posts.id = post_likes.post_id
      and statuses.is_public
  )
);

update public.posts
set likes_count = (
  select count(*)::integer
  from public.post_likes
  where post_likes.post_id = posts.id
);

create or replace function private.refresh_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts
  set likes_count = greatest(
    0,
    likes_count + case when tg_op = 'INSERT' then 1 else -1 end
  )
  where id = coalesce(new.post_id, old.post_id);

  return coalesce(new, old);
end;
$$;

revoke execute on function private.refresh_post_likes_count()
from public, anon, authenticated, service_role;
