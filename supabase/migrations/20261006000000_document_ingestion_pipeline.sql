-- Enable the pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Note: The 'tenants' table is assumed to be handled by the existing MVP Tenant Foundation migration
-- If tenants are managed in user_profiles or organizations in this codebase, we will link directly to them.
-- In OmniRelay, multi-tenancy is typically handled via `organizations` or `workspaces`.
-- Let's use `organizations` as the foreign key based on standard Supabase patterns in this codebase.
-- Looking at prior migrations, `organizations` is the tenant boundary.

-- 1. Tenant Documents Table (Tracks raw uploaded files)
CREATE TABLE IF NOT EXISTS public.tenant_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Document Chunks Table (Stores vectorized text chunks with pgvector)
-- Using VECTOR(768) to match Google Gemini text-embedding-004 dimensions.
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.tenant_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Fast Vector Similarity Search (HNSW)
-- HNSW is significantly faster and more accurate than ivfflat.
CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- Standard tenant indexing for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_documents_org ON public.tenant_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_org ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON public.document_chunks(document_id);

-- 4. Row-Level Security (RLS) Enforcement
ALTER TABLE public.tenant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Assuming standard auth logic: users can read/write if they belong to the organization
CREATE POLICY "Users can access documents in their organization"
    ON public.tenant_documents
    FOR ALL
    USING (
        private.is_organization_member(organization_id, 'member')
    );

CREATE POLICY "Users can access document chunks in their organization"
    ON public.document_chunks
    FOR ALL
    USING (
        private.is_organization_member(organization_id, 'member')
    );
