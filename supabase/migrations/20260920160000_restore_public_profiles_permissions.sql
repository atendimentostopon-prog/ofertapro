-- Keep public showcases readable by visitors.
-- The view only exposes the public profile fields defined by its migration.
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;
