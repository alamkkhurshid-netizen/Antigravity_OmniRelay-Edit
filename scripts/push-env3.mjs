import { execSync } from 'child_process';

const url = 'https://omnirelay-main.vercel.app';

function addEnv(name, value) {
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
}

addEnv('NEXT_PUBLIC_APP_URL', url);
addEnv('NEXT_PUBLIC_SITE_URL', url);
