const embeddingModel = "gemini-embedding-001";
const embeddingDimensions = 1536;

type TaskType = "RETRIEVAL_DOCUMENT" | "QUESTION_ANSWERING";

export function chunkKnowledge(content: string, maximumLength = 1600) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + maximumLength);
    if (end < normalized.length) {
      const sentenceEnd = Math.max(normalized.lastIndexOf(". ", end), normalized.lastIndexOf("; ", end), normalized.lastIndexOf("? ", end));
      if (sentenceEnd > cursor + 600) end = sentenceEnd + 1;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end;
  }
  return chunks.filter(Boolean);
}

export async function createKnowledgeEmbedding(input: string, taskType: TaskType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Knowledge indexing is not configured.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      taskType,
      outputDimensionality: embeddingDimensions,
      content: { parts: [{ text: input }] },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The knowledge embedding request could not be completed.");
  const payload = await response.json() as { embedding?: { values?: unknown } };
  const values = payload.embedding?.values;
  if (!Array.isArray(values) || values.length !== embeddingDimensions || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("The knowledge embedding response was invalid.");
  }
  return values as number[];
}

export const vectorLiteral = (values: number[]) => `[${values.join(",")}]`;
