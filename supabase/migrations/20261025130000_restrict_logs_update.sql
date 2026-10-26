-- Owners may only edit body and rating on their logs; created_at, volume_id
-- and user_id are immutable from the client. updated_at is still maintained
-- by the logs_set_updated_at trigger (column privileges only apply to the
-- columns named in the UPDATE, not to values set inside a trigger).
revoke update on public.logs from authenticated;
grant update (body, rating) on public.logs to authenticated;
