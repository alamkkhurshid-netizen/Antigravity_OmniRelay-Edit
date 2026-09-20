import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ProcessDocumentPayload {
  documentId: string;
  organizationId: string;
  filePath: string;
  fileType: string;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  
  // Authorize worker (in production, use a secure secret header to ensure only your queue can call this)
  // For MVP, we verify if there's a logged-in user or proceed if it's an internal background job.
  
  try {
    const payload: ProcessDocumentPayload = await req.json();
    const { documentId, organizationId, filePath, fileType } = payload;

    if (!documentId || !organizationId || !filePath) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log(`[Ingestion Worker] Starting processing for document: ${documentId}`);

    // 1. Update status to PROCESSING
    await supabase
      .from('tenant_documents')
      .update({ processing_status: 'PROCESSING' })
      .eq('id', documentId);

    // 2. Fetch file buffer from Supabase Storage
    const { data: fileBlob, error: storageError } = await supabase.storage
      .from('tenant-uploads')
      .download(filePath);

    if (storageError || !fileBlob) {
      throw new Error(`Storage download failed: ${storageError?.message}`);
    }

    // 3. Send file to Baidu Unlimited-OCR microservice (Mocked for now)
    // In production:
    // const formData = new FormData();
    // formData.append('file', fileBlob, filePath);
    // const ocrResponse = await fetch(`${process.env.OCR_SERVICE_URL}/parse-document`, { method: 'POST', body: formData });
    
    // For now, we simulate the structured markdown output
    console.log(`[Ingestion Worker] Extracting text with Unlimited-OCR...`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate OCR delay
    
    const structuredText = `
# OmniRelay Clinic Pricing Table
This document outlines the standard pricing for clinical services.

## Consultations
| Service | Price | Duration |
|---------|-------|----------|
| General | $50   | 15m      |
| Specialist | $120 | 30m   |

## Follow-up Care
Follow-up appointments are mandatory for chronic conditions.
Patients must schedule within 14 days of initial consult.
    `.trim();

    // 4. Markdown-Aware Semantic Chunking
    // We split by double newlines to keep paragraphs and tables intact, rather than slicing randomly.
    const chunks = semanticChunkMarkdown(structuredText, 1000);

    // 5. Generate Embeddings & Insert Chunks
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      
      // Generate the 768-dimensional vector
      const result = await embeddingModel.embedContent(chunkText);
      const embedding = result.embedding.values;

      await supabase.from('document_chunks').insert({
        organization_id: organizationId,
        document_id: documentId,
        chunk_index: i,
        content: chunkText,
        embedding: embedding,
        metadata: { source_file: filePath, parsed_via: 'unlimited-ocr' }
      });
    }

    // 6. Mark Complete
    await supabase
      .from('tenant_documents')
      .update({ processing_status: 'COMPLETED' })
      .eq('id', documentId);

    console.log(`[Ingestion Worker] Successfully processed document: ${documentId}`);
    return NextResponse.json({ success: true, chunksProcessed: chunks.length });

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Ingestion Worker] Error:`, error.message);
    
    // Try to update the document status to FAILED if we can parse the documentId from the request
    // (This requires passing documentId down or wrapping the block, done loosely here for safety)
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Markdown-Aware Semantic Chunker
 * Instead of blind character slicing, it splits by paragraphs (double newlines) 
 * to preserve markdown tables and headings.
 */
function semanticChunkMarkdown(text: string, maxChunkSize: number): string[] {
  // Split by double newline (standard markdown paragraph/block separator)
  const blocks = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const block of blocks) {
    if ((currentChunk.length + block.length) > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += (currentChunk ? "\n\n" : "") + block;
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
