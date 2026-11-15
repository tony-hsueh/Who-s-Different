import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export interface LanCandidate {
  name: string;
  address: string;
}

// Adapters that belong to a VM, container or VPN. A phone on the Wi-Fi cannot reach them.
const VIRTUAL_NAME =
  /vethernet|virtualbox|vmware|vmnet|hyper-v|wsl|docker|veth|br-|vbox|virbr|lxcbr|lxdbr|podman|cni|flannel|kube|tailscale|zerotier|loopback|utun|tun\d|tap\d/i;

function privateRank(address: string): number {
  const [a = 0, b = 0] = address.split('.').map(Number);
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  return 3;
}

const isIPv4 = (info: NetworkInterfaceInfo) =>
  info.family === 'IPv4' || (info.family as unknown) === 4;

// External IPv4 addresses, best guess first: real adapters before virtual ones, then
// 192.168 before 10 before 172.16-31 before anything else.
export function listLanCandidates(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LanCandidate[] {
  const found: (LanCandidate & { order: number; virtual: boolean })[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.internal || !isIPv4(info)) continue;
      if (info.address.startsWith('169.254.')) continue;
      found.push({
        name,
        address: info.address,
        order: found.length,
        virtual: VIRTUAL_NAME.test(name),
      });
    }
  }
  return found
    .sort(
      (x, y) =>
        Number(x.virtual) - Number(y.virtual) ||
        privateRank(x.address) - privateRank(y.address) ||
        x.order - y.order,
    )
    .map(({ name, address }) => ({ name, address }));
}

export const pickLanAddress = (candidates: LanCandidate[]) =>
  candidates[0]?.address;

export interface LanEnv {
  port: number;
  publicBaseUrl: string;
  adminToken: string;
  generatedToken: boolean;
}

// An explicit PUBLIC_BASE_URL or ADMIN_TOKEN always wins over what the script would make up.
export function lanEnv(
  env: NodeJS.ProcessEnv,
  address: string,
  makeToken: () => string,
): LanEnv {
  const port = Number(env.PORT || 3000);
  const adminToken = env.ADMIN_TOKEN || makeToken();
  return {
    port,
    publicBaseUrl: env.PUBLIC_BASE_URL || `http://${address}:${port}`,
    adminToken,
    generatedToken: !env.ADMIN_TOKEN,
  };
}
