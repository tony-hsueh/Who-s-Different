// Starts the built server for a game night on the local network.
// Run: npm run build && npm run start:lan   (needs only Node, no dev dependencies)
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { platform } from 'node:process';

const dist = new URL('../dist/server/server/', import.meta.url);
if (!existsSync(new URL('index.js', dist))) {
  console.error('找不到 dist。請先執行 npm run build。');
  process.exit(1);
}

const { lanEnv, listLanCandidates, pickLanAddress } = await import(
  new URL('lan.js', dist).href
);

const candidates = listLanCandidates();
const address = pickLanAddress(candidates);
if (!address) {
  console.error('找不到區網 IP。請確認電腦已連上 Wi-Fi 或網路線。');
  process.exit(1);
}

const { port, publicBaseUrl, adminToken, generatedToken } = lanEnv(
  process.env,
  address,
  () => randomBytes(24).toString('base64url'),
);
process.env.PORT = String(port);
process.env.PUBLIC_BASE_URL = publicBaseUrl;
process.env.ADMIN_TOKEN = adminToken;

console.log('區網 IP 候選（用第一個）：');
for (const { name, address: ip } of candidates)
  console.log(`  ${ip}  (${name})`);
console.log('');
console.log(`在筆電上用瀏覽器打開：${publicBaseUrl}`);
console.log('主持人請一直用同一個瀏覽器、同一個網址，換了就沒有主持權限。');
if (generatedToken) {
  console.log(`ADMIN_TOKEN（只印這一次）：${adminToken}`);
}
if (platform === 'win32') {
  console.log('');
  console.log(
    'Windows 防火牆要放行這個連接埠，手機才連得進來。用系統管理員身分執行：',
  );
  console.log(
    `  netsh advfirewall firewall add rule name="Whos-Different" dir=in action=allow protocol=TCP localport=${port}`,
  );
}
console.log('');

await import(new URL('index.js', dist).href);
