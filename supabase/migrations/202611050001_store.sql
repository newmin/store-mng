-- A single versioned aggregate keeps orders, production, stock and their audit
-- entries atomic. Child records retain independent IDs inside the JSON document.
create table public.shops (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null);
create table public.shop_members (shop_id uuid references public.shops on delete cascade not null, user_id uuid references auth.users on delete cascade not null unique, primary key(shop_id,user_id));
create table public.shop_state (shop_id uuid primary key references public.shops on delete cascade, version bigint not null default 0, document jsonb not null, updated_at timestamptz not null default now());
create table public.command_log (shop_id uuid references public.shops on delete cascade not null, request_id uuid not null, actor uuid not null references auth.users, created_at timestamptz not null default now(), primary key(shop_id,request_id));
create function public.limit_shop_members() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from public.shops where id=new.shop_id for update;
 if (select count(*) from public.shop_members where shop_id=new.shop_id)>=2 then raise exception '한 매장에는 두 계정까지 등록할 수 있습니다.'; end if;
 return new;
end $$;
create trigger limit_members before insert on public.shop_members for each row execute function public.limit_shop_members();
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_state enable row level security;
alter table public.command_log enable row level security;
grant select on public.shops,public.shop_members,public.shop_state to authenticated;
grant all on public.shops,public.shop_members,public.shop_state,public.command_log to service_role;
create policy own_membership on public.shop_members for select to authenticated using (user_id=auth.uid());
create policy member_shop on public.shops for select to authenticated using (exists(select 1 from public.shop_members where shop_id=shops.id and user_id=auth.uid()));
create policy member_state on public.shop_state for select to authenticated using (exists(select 1 from public.shop_members where shop_id=shop_state.shop_id and user_id=auth.uid()));
-- No browser INSERT/UPDATE/DELETE policy. Only the authenticated server can commit.
create function public.commit_store(p_shop uuid,p_actor uuid,p_version bigint,p_document jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_row public.shop_state;
begin
 if not exists(select 1 from public.shop_members where shop_id=p_shop and user_id=p_actor) then raise exception 'FORBIDDEN'; end if;
 select * into current_row from public.shop_state where shop_id=p_shop for update;
 if not found then raise exception 'NOT_INITIALIZED'; end if;
 if exists(select 1 from public.command_log where shop_id=p_shop and request_id=p_request and actor=p_actor) then return jsonb_build_object('version',current_row.version,'document',current_row.document); end if;
 if current_row.version<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 if jsonb_typeof(p_document)<>'object' then raise exception 'INVALID_DOCUMENT'; end if;
 update public.shop_state set document=p_document,version=version+1,updated_at=now() where shop_id=p_shop returning * into current_row;
 insert into public.command_log(shop_id,request_id,actor) values(p_shop,p_request,p_actor);
 return jsonb_build_object('version',current_row.version,'document',current_row.document);
end $$;
revoke all on function public.commit_store(uuid,uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.commit_store(uuid,uuid,bigint,jsonb,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('stickers','stickers',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy member_images_read on storage.objects for select to authenticated using (bucket_id='stickers' and exists(select 1 from public.shop_members where shop_id::text=(storage.foldername(name))[1] and user_id=auth.uid()));
create policy member_images_insert on storage.objects for insert to authenticated with check (bucket_id='stickers' and exists(select 1 from public.shop_members where shop_id::text=(storage.foldername(name))[1] and user_id=auth.uid()));
