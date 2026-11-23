-- =====================================================================
-- COC Ewe Hymnal: put several hymns into (or take them out of) a
-- category at once. (Phase 2)
--
-- Adds ONE new action for the admin site. Every hymn it changes gets an
-- entry in the change history, like any other edit. Nothing is deleted.
-- Run it ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

create or replace function public.set_category_hymns(p_category_id uuid, p_hymn_ids uuid[], p_add boolean)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_changed int := 0;
  v_published boolean := false;
begin
  perform public.require_admin();
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'That category no longer exists.';
  end if;

  foreach v_id in array coalesce(p_hymn_ids, '{}') loop
    if not exists (select 1 from public.hymns where id = v_id) then
      continue;
    end if;
    if p_add then
      insert into public.hymn_categories (hymn_id, category_id) values (v_id, p_category_id)
      on conflict do nothing;
    else
      delete from public.hymn_categories where hymn_id = v_id and category_id = p_category_id;
    end if;
    if found then
      v_changed := v_changed + 1;
      update public.hymns set updated_at = now(), updated_by = auth.uid() where id = v_id;
      perform public.log_hymn(v_id, 'edit');
      if (select status from public.hymns where id = v_id) = 'published' then
        v_published := true;
      end if;
    end if;
  end loop;

  if v_published then
    perform public.bump_content_version();
  end if;
  return v_changed;
end;
$$;

revoke execute on function public.set_category_hymns(uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_category_hymns(uuid, uuid[], boolean) to authenticated;
