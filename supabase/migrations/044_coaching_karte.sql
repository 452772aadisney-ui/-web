-- コーチングカルテ（面談記録）
CREATE TABLE IF NOT EXISTS public.coaching_karte_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.coaching_bookings (id) ON DELETE SET NULL,
  coach_id uuid REFERENCES public.coaching_coaches (id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  discussion_content text NOT NULL DEFAULT '',
  next_commitments text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_karte_discussion_not_empty CHECK (char_length(trim(discussion_content)) > 0)
);

COMMENT ON TABLE public.coaching_karte_entries IS 'コーチング面談カルテ（話した内容・次回約束）';

CREATE INDEX IF NOT EXISTS coaching_karte_entries_student_idx
  ON public.coaching_karte_entries (student_id, session_date DESC, created_at DESC);

DROP TRIGGER IF EXISTS coaching_karte_entries_updated_at ON public.coaching_karte_entries;
CREATE TRIGGER coaching_karte_entries_updated_at
  BEFORE UPDATE ON public.coaching_karte_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.coaching_karte_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coaching_karte_admin_all" ON public.coaching_karte_entries;
CREATE POLICY "coaching_karte_admin_all"
  ON public.coaching_karte_entries
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
