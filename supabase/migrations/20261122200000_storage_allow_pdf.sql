-- Migration: Ensure storage buckets support PDF documents alongside image formats
-- Resolves "Upload failed: mime type application/pdf is not supported" on creative-assets

DO $$
BEGIN
  -- 1. Ensure creative-assets allows PDF documents
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'creative-assets') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    WHERE id = 'creative-assets';
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'creative-assets',
      'creative-assets',
      true,
      10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = true,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
  END IF;

  -- 2. Ensure clinical-documents allows both PDF and clinical images
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'clinical-documents') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    WHERE id = 'clinical-documents';
  END IF;

  -- 3. Ensure clinic-brochures allows PDF documents
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'clinic-brochures') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY['application/pdf']
    WHERE id = 'clinic-brochures';
  END IF;
END $$;
