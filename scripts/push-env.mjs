import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const url = 'https://dwkwxrcuycsqiviozgtl.supabase.co';
const key = 'sb_publishable_3grC9A55pdDrV4kw5U8ZFg_45UIWt_B';

function addEnv(name, value) {
  try {
    console.log(`Adding ${name} to production...`);
    execSync(`vercel env rm ${name} production -y`, { stdio: 'ignore' }).catch(() => {});
  } catch(e) {}
  
  try {
    // Vercel CLI accepts value from stdin
    execSync(`vercel env add ${name} production`, { 
      input: value,
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    console.log(`Successfully added ${name} to production!`);
  } catch (e) {
    console.error(`Failed to add ${name}:`, e.message);
  }
}

addEnv('NEXT_PUBLIC_SUPABASE_URL', url);
addEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', key);
addEnv('SUPABASE_URL', url);
addEnv('SUPABASE_ANON_KEY', key);
