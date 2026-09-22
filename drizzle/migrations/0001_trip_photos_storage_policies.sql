CREATE POLICY "trip photos own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "trip photos own insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "trip photos own update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "trip photos own delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'trip-photos' AND (storage.foldername(name))[1] = auth.uid()::text);