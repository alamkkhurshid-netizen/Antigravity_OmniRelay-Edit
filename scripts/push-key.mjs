import { execSync } from 'child_process';

const name = process.argv[2];
const value = process.argv[3];

if (!name || !value) {
  console.error("Usage: node push-key.mjs <ENV_VAR_NAME> <VALUE>");
  process.exit(1);
}

try {
  console.log(`Adding ${name} to production...`);
  execSync(`vercel env rm ${name} production -y`, { stdio: 'ignore' }).catch(() => {});
} catch(e) {}

try {
  execSync(`vercel env add ${name} production`, { 
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'] 
  });
  console.log(`Successfully added ${name} to production!`);
} catch (e) {
  console.error(`Failed to add ${name}:`, e.message);
}
