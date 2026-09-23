-- Persistent, tenant-isolated state for the mandatory onboarding wizard.
--
-- onboarding_progress is the current snapshot consumed by the application.
-- onboarding_validation_attempts is append-oriented evidence of every real
-- integration check. Keeping attempts separate prevents a later failure (or
-- retry) from overwriting the audit trail of earlier validations.

CREATE TABLE public.onboarding_progress (
  user_id UUID PRIMARY KEY
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_step SMALLINT NOT NULL DEFAULT 1
    CHECK (current_step BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  step_1_validated_at TIMESTAMPTZ,
  step_2_validated_at TIMESTAMPTZ,
  step_3_validated_at TIMESTAMPTZ,
  step_4_validated_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT onboarding_progress_started_state_check CHECK (
    (status = 'not_started' AND started_at IS NULL)
    OR (status IN ('in_progress', 'completed') AND started_at IS NOT NULL)
  ),
  CONSTRAINT onboarding_progress_completed_state_check CHECK (
    (status = 'completed'
      AND current_step = 4
      AND step_4_validated_at IS NOT NULL
      AND completed_at IS NOT NULL)
    OR (status <> 'completed'
      AND step_4_validated_at IS NULL
      AND completed_at IS NULL)
  ),
  CONSTRAINT onboarding_progress_step_sequence_check CHECK (
    (step_2_validated_at IS NULL OR step_1_validated_at IS NOT NULL)
    AND (step_3_validated_at IS NULL OR step_2_validated_at IS NOT NULL)
    AND (step_4_validated_at IS NULL OR step_3_validated_at IS NOT NULL)
    AND (current_step < 2 OR step_1_validated_at IS NOT NULL)
    AND (current_step < 3 OR step_2_validated_at IS NOT NULL)
    AND (current_step < 4 OR step_3_validated_at IS NOT NULL)
  ),
  CONSTRAINT onboarding_progress_timestamp_order_check CHECK (
    (step_1_validated_at IS NULL OR started_at IS NULL OR step_1_validated_at >= started_at)
    AND (step_2_validated_at IS NULL OR step_2_validated_at >= step_1_validated_at)
    AND (step_3_validated_at IS NULL OR step_3_validated_at >= step_2_validated_at)
    AND (step_4_validated_at IS NULL OR step_4_validated_at >= step_3_validated_at)
    AND (completed_at IS NULL OR completed_at >= step_4_validated_at)
  )
);

COMMENT ON TABLE public.onboarding_progress IS
  'Current state of the mandatory four-step onboarding wizard, one row per tenant/user.';

CREATE TABLE public.onboarding_validation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  step SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 4),
  validation_kind TEXT NOT NULL
    CHECK (char_length(btrim(validation_kind)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(result) = 'object'),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 100),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT onboarding_validation_terminal_state_check CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT onboarding_validation_timestamp_order_check CHECK (
    completed_at IS NULL OR completed_at >= started_at
  ),
  CONSTRAINT onboarding_validation_error_check CHECK (
    status <> 'succeeded' OR (error_code IS NULL AND error_message IS NULL)
  )
);

COMMENT ON TABLE public.onboarding_validation_attempts IS
  'Immutable-in-practice history of connection tests and their structured results.';

CREATE INDEX onboarding_progress_status_updated_idx
  ON public.onboarding_progress (status, updated_at DESC);

CREATE INDEX onboarding_validation_user_step_started_idx
  ON public.onboarding_validation_attempts (user_id, step, started_at DESC);

CREATE INDEX onboarding_validation_running_idx
  ON public.onboarding_validation_attempts (user_id, started_at)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.set_onboarding_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_onboarding_progress_updated_at
BEFORE UPDATE ON public.onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.set_onboarding_updated_at();

CREATE TRIGGER set_onboarding_validation_attempt_updated_at
BEFORE UPDATE ON public.onboarding_validation_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_onboarding_updated_at();

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_validation_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_onboarding_progress"
  ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_onboarding_progress"
  ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_onboarding_progress"
  ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_select_own_onboarding_validation_attempts"
  ON public.onboarding_validation_attempts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_onboarding_validation_attempts"
  ON public.onboarding_validation_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_onboarding_validation_attempts"
  ON public.onboarding_validation_attempts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_validation_attempts TO authenticated;

-- Deliberately no DELETE policy: validation evidence and completion state must
-- not be removable through the client API. service_role retains administrative
-- access and bypasses RLS for migrations and support operations.
