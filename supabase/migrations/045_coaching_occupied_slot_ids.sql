-- 予約済み枠の判定（他生徒の予約はRLSで見えないため、slot_id のみ返す関数）
CREATE OR REPLACE FUNCTION public.get_occupied_coaching_slot_ids(p_slot_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slot_id
  FROM public.coaching_bookings
  WHERE slot_id = ANY (p_slot_ids)
    AND status = 'scheduled';
$$;

REVOKE ALL ON FUNCTION public.get_occupied_coaching_slot_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupied_coaching_slot_ids(uuid[]) TO authenticated;
