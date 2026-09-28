const fs = require('fs');
const path = require('path');

const replacements = [
  { search: /rounded-\[1\.5rem\]/g, replace: 'rounded-2xl' },
  { search: /rounded-\[1\.75rem\]/g, replace: 'rounded-2xl' },
  { search: /rounded-3xl/g, replace: 'rounded-2xl' },
  { search: /rounded-\[1\.25rem\]/g, replace: 'rounded-xl' },
  { search: /\bp-8\b/g, replace: 'p-6' },
  { search: /\bp-7\b/g, replace: 'p-5' },
  { search: /\bpx-8\b/g, replace: 'px-6' },
  { search: /\bpy-8\b/g, replace: 'py-6' },
  { search: /\bgap-8\b/g, replace: 'gap-6' },
  { search: /\bgap-7\b/g, replace: 'gap-5' },
  { search: /\btext-5xl\b/g, replace: 'text-4xl' },
  { search: /\btext-4xl\b/g, replace: 'text-3xl' },
  { search: /\btext-3xl\b/g, replace: 'text-2xl' },
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (stat.isFile() && fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      for (const rule of replacements) {
        content = content.replace(rule.search, rule.replace);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'app/app'));
console.log('Global UI scaling applied successfully.');
