drop policy categories_select_active on public.categories;
drop policy categories_select_content_admin on public.categories;

create policy categories_select_active_anon
on public.categories for select
to anon
using (is_active);

create policy categories_select_authenticated
on public.categories for select
to authenticated
using (
  is_active
  or (select private.current_user_is_content_admin())
);

drop policy posts_select_published on public.posts;
drop policy posts_select_content_admin on public.posts;

create policy posts_select_published_anon
on public.posts for select
to anon
using (
  exists (
    select 1
    from public.statuses
    where statuses.id = posts.status_id
      and statuses.is_public
  )
);

create policy posts_select_authenticated
on public.posts for select
to authenticated
using (
  exists (
    select 1
    from public.statuses
    where statuses.id = posts.status_id
      and statuses.is_public
  )
  or (select private.current_user_is_content_admin())
);

drop policy comments_select_visible on public.comments;
drop policy comments_select_own_or_admin on public.comments;

create policy comments_select_visible_anon
on public.comments for select
to anon
using (not is_deleted);

create policy comments_select_authenticated
on public.comments for select
to authenticated
using (
  not is_deleted
  or author_id = (select auth.uid())
  or (select private.current_user_is_admin())
);

drop policy avatars_public_read on storage.objects;
drop policy post_images_public_read on storage.objects;

create policy avatars_select_own_folder
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy post_images_select_content_admin
on storage.objects for select
to authenticated
using (
  bucket_id = 'post-images'
  and (select private.current_user_is_content_admin())
);
