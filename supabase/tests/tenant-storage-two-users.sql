\set ON_ERROR_STOP on

-- Simulate the transaction-attachments Storage policies in a disposable
-- PostgreSQL database. This uses the same folder-owner rule as production.
-- Run after tenant-rls-two-users.sql, which defines auth.uid() and roles.
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(path text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT pg_catalog.string_to_array(path, '/')[:(pg_catalog.array_length(pg_catalog.string_to_array(path, '/'), 1) - 1)] $$;

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transaction files" ON storage.objects FOR SELECT
  USING (bucket_id='transaction-attachments' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users can upload own transaction files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='transaction-attachments' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users can delete own transaction files" ON storage.objects FOR DELETE
  USING (bucket_id='transaction-attachments' AND auth.uid()::text=(storage.foldername(name))[1]);

GRANT USAGE ON SCHEMA storage TO authenticated,anon;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated,anon;
GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

INSERT INTO storage.objects VALUES
  ('aaaaaaaa-0000-4000-8000-000000000201','transaction-attachments','aaaaaaaa-0000-4000-8000-000000000000/a.jpg'),
  ('bbbbbbbb-0000-4000-8000-000000000201','transaction-attachments','bbbbbbbb-0000-4000-8000-000000000000/b.jpg');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000000',true);
DO $tests$
DECLARE affected integer;
        denied boolean := false;
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN
    RAISE EXCEPTION 'User A can view User B receipt';
  END IF;
  DELETE FROM storage.objects WHERE id='bbbbbbbb-0000-4000-8000-000000000201';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN
    RAISE EXCEPTION 'User A can delete User B receipt';
  END IF;
  BEGIN
    INSERT INTO storage.objects VALUES
      ('aaaaaaaa-0000-4000-8000-000000000202','transaction-attachments',
       'bbbbbbbb-0000-4000-8000-000000000000/c.jpg');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'User A can upload into User B folder'; END IF;
  INSERT INTO storage.objects VALUES
    ('aaaaaaaa-0000-4000-8000-000000000203','transaction-attachments',
     'aaaaaaaa-0000-4000-8000-000000000000/own.pdf');
END $tests$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000000',true);
DO $tests$
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 1 THEN
    RAISE EXCEPTION 'User B can view User A files';
  END IF;
END $tests$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  IF EXISTS(SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Anonymous client can read receipt metadata';
  END IF;
END $anon$;
COMMIT;

SELECT 'PASS: storage file paths private across two users and anonymous clients' AS result;
