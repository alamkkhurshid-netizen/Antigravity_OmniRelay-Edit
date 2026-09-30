-- Migration: Phase 4 Performance Indexes
-- Adds supplementary indexes identified during the database audit to speed up queue polling and dashboard sorting.

-- Speed up the document ingestion worker polling for pending documents
CREATE INDEX IF NOT EXISTS idx_tenant_documents_status ON public.tenant_documents(processing_status) WHERE processing_status = 'PENDING';

-- Speed up document dashboard sorting
CREATE INDEX IF NOT EXISTS idx_tenant_documents_created_at ON public.tenant_documents(organization_id, created_at DESC);

-- Speed up chunk retrieval sorting
CREATE INDEX IF NOT EXISTS idx_document_chunks_created_at ON public.document_chunks(organization_id, created_at DESC);
