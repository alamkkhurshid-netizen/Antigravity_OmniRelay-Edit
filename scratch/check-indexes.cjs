const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/00000000000000_initial_schema.sql', 'utf8');

const tables = [];
let currentTable = null;

const lines = sql.split('\n');
for (const line of lines) {
  const tableMatch = line.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/i);
  if (tableMatch) {
    currentTable = { name: tableMatch[1], fks: [], indexes: [] };
    tables.push(currentTable);
    continue;
  }

  if (currentTable) {
    const fkMatch = line.match(/([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_]+\s+.*REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)/i);
    if (fkMatch && !line.includes('--')) {
      currentTable.fks.push(fkMatch[1]);
    }
    
    // Also catch standalone ALTER TABLE ADD FOREIGN KEY if any (just keeping simple for now)
  }
}

// Now find indexes
const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(?:[a-zA-Z0-9_]+\s+)?ON\s+(?:public\.)?([a-zA-Z0-9_]+)\s*(?:USING\s+[a-zA-Z0-9_]+\s*)?\(\s*([^)]+)\s*\)/gi;
let match;
while ((match = indexRegex.exec(sql)) !== null) {
  const tableName = match[1];
  const columns = match[2].split(',').map(c => c.trim().replace(/['"]/g, '').split(' ')[0]); // Get first column
  const table = tables.find(t => t.name === tableName);
  if (table) {
    table.indexes.push(...columns);
  }
}

// Check missing
let missing = 0;
for (const t of tables) {
  for (const fk of t.fks) {
    // Basic check if there's any index starting with this column
    if (!t.indexes.includes(fk)) {
      console.log(`Table ${t.name} missing index on FK: ${fk}`);
      missing++;
    }
  }
}

if (missing === 0) {
  console.log("No obvious missing indexes on FKs found!");
}
