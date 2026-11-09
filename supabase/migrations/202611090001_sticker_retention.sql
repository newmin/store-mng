-- Keep the original array order and anchor older work before its order is edited.
create function public.retained_sticker_designs(doc jsonb, as_of timestamptz)
returns jsonb language sql stable set search_path = pg_catalog as $$
  with designs as (
    select design, ordinal,
      (design->>'kind' = 'order' or
        (design->>'kind' is null and design->>'orderId' is not null)) is_order
    from jsonb_array_elements(doc->'stickerDesigns') with ordinality as d(design, ordinal)
  ), dated as (
    select *, case when is_order then coalesce(
      design->>'createdAt', design->>'updatedAt',
      (select o->>'updatedAt' from jsonb_array_elements(doc->'orders') o
       where o->>'id' = design->>'orderId' limit 1),
      to_char(as_of at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) end as created from designs
  )
  select coalesce(jsonb_agg(
    case when is_order then design || jsonb_build_object('createdAt', created) else design end
    order by ordinal
  ), '[]'::jsonb)
  from dated
  where is_order is not true or
    created::timestamptz + interval '24 hours' * coalesce((design->>'retentionDays')::int, 30) > as_of;
$$;

create function public.prune_expired_sticker_work()
returns void language sql set search_path = pg_catalog as $$
  update public.shop_state
  set document = jsonb_set(document, '{stickerDesigns}', public.retained_sticker_designs(document, now())),
      version = version + 1, updated_at = now()
  where document ? 'stickerDesigns'
    and document->'stickerDesigns' is distinct from public.retained_sticker_designs(document, now());
$$;
revoke all on function public.prune_expired_sticker_work() from public, anon, authenticated;
select public.prune_expired_sticker_work();

create extension if not exists pg_cron;
select cron.schedule('expire-order-stickers', '* * * * *', 'select public.prune_expired_sticker_work()');
