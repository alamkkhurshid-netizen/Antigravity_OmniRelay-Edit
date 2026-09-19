import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is missing");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function ingest() {
  const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
  if (!orgs || orgs.length === 0) {
    console.error("No organization found to attach knowledge to.");
    return;
  }
  const orgId = orgs[0].id;

  const files = [
    { title: "OmniRelay Master Blueprint", path: "C:/Users/khurs/OneDrive/Desktop/Antigravity_Omnirelay/Omnirelay_Master_Blueprint v1.md" },
    { title: "CTO Audit Report", path: "C:/Users/khurs/.gemini/antigravity-ide/brain/433fa74b-bdfb-45ea-aab8-218be315d455/audit_missing_modules.md" },
    { title: "RAG Bot Architecture Review", path: "C:/Users/khurs/.gemini/antigravity-ide/brain/433fa74b-bdfb-45ea-aab8-218be315d455/rag_bot_review.md" }
  ];

  for (const file of files) {
    try {
      const content = await fs.readFile(file.path, "utf8");
      
      const { error } = await supabase.from("rag_knowledge_items").insert({
        organization_id: orgId,
        title: file.title,
        source_type: "system_architecture",
        content: content.substring(0, 19999), // Keep within constraint
        status: "approved"
      });
      
      if (error) {
        console.error(`Failed to insert ${file.title}:`, error.message);
      } else {
        console.log(`Inserted ${file.title}`);
      }
    } catch (e) {
      console.error(`Error reading ${file.title}:`, e.message);
    }
  }
}

ingest();
