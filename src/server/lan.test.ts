import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanEnv, listLanCandidates, pickLanAddress } from './lan.js';

function nic(
  address: string,
  patch: {
    family?: string | number;
    internal?: boolean;
    cidr?: string | null;
  } = {},
): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/24`,
    ...patch,
  } as NetworkInterfaceInfo;
}

describe('listLanCandidates', () => {
  it('keeps only external IPv4 addresses', () => {
    const found = listLanCandidates({
      lo: [nic('127.0.0.1', { internal: true })],
      Ethernet: [
        nic('192.168.1.23'),
        nic('fe80::1', { family: 'IPv6', cidr: null }),
      ],
      Odd: [nic('169.254.10.2')],
    });
    expect(found.map((c) => c.address)).toStrictEqual(['192.168.1.23']);
  });

  it('accepts the numeric family older Node versions report', () => {
    const numeric = nic('192.168.1.5', { family: 4 });
    expect(listLanCandidates({ eth0: [numeric] })).toHaveLength(1);
  });

  it('skips interfaces without addresses', () => {
    expect(listLanCandidates({ eth0: undefined })).toStrictEqual([]);
  });

  it('ranks 192.168 before 10 before 172.16-31 before public addresses', () => {
    const found = listLanCandidates({
      a: [nic('8.8.4.4')],
      b: [nic('172.20.0.2')],
      c: [nic('10.0.0.7')],
      d: [nic('192.168.0.9')],
    });
    expect(found.map((c) => c.address)).toStrictEqual([
      '192.168.0.9',
      '10.0.0.7',
      '172.20.0.2',
      '8.8.4.4',
    ]);
  });

  it('does not treat 172.15 or 172.32 as private', () => {
    const found = listLanCandidates({
      a: [nic('172.15.0.1')],
      b: [nic('172.16.0.1')],
      c: [nic('172.32.0.1')],
    });
    expect(found[0]?.address).toBe('172.16.0.1');
  });

  it('puts Linux virtual bridges behind the real adapter', () => {
    const found = listLanCandidates({
      virbr0: [nic('192.168.122.1')],
      lxcbr0: [nic('10.0.3.1')],
      wlp3s0: [nic('10.0.0.7')],
    });
    expect(found[0]?.name).toBe('wlp3s0');
  });

  it('puts virtual adapters last even when their address ranks higher', () => {
    const found = listLanCandidates({
      'vEthernet (WSL)': [nic('172.24.48.1')],
      'VirtualBox Host-Only Network': [nic('192.168.56.1')],
      'Wi-Fi': [nic('10.1.2.3')],
    });
    expect(found.map((c) => c.name)).toStrictEqual([
      'Wi-Fi',
      'VirtualBox Host-Only Network',
      'vEthernet (WSL)',
    ]);
  });
});

describe('pickLanAddress', () => {
  it('returns the first candidate', () => {
    const found = listLanCandidates({
      'vEthernet (WSL)': [nic('172.24.48.1')],
      'Wi-Fi': [nic('192.168.1.23')],
    });
    expect(pickLanAddress(found)).toBe('192.168.1.23');
  });

  it('falls back to a virtual adapter when it is the only one', () => {
    const found = listLanCandidates({ docker0: [nic('172.17.0.1')] });
    expect(pickLanAddress(found)).toBe('172.17.0.1');
  });

  it('returns undefined when there is no network', () => {
    const found = listLanCandidates({
      lo: [nic('127.0.0.1', { internal: true })],
    });
    expect(pickLanAddress(found)).toBeUndefined();
  });
});

describe('lanEnv', () => {
  const token = () => 'generated';

  it('builds the public URL from the address and port, and makes a token', () => {
    expect(lanEnv({}, '192.168.1.23', token)).toStrictEqual({
      port: 3000,
      publicBaseUrl: 'http://192.168.1.23:3000',
      adminToken: 'generated',
      generatedToken: true,
    });
  });

  it('uses PORT from the environment', () => {
    expect(lanEnv({ PORT: '4000' }, '10.0.0.7', token).publicBaseUrl).toBe(
      'http://10.0.0.7:4000',
    );
  });

  it('keeps PUBLIC_BASE_URL and ADMIN_TOKEN that are already set', () => {
    expect(
      lanEnv(
        { PUBLIC_BASE_URL: 'https://game.example.com', ADMIN_TOKEN: 'mine' },
        '10.0.0.7',
        token,
      ),
    ).toStrictEqual({
      port: 3000,
      publicBaseUrl: 'https://game.example.com',
      adminToken: 'mine',
      generatedToken: false,
    });
  });

  it('falls back to 3000 when PORT is empty', () => {
    expect(lanEnv({ PORT: '' }, '10.0.0.7', token).port).toBe(3000);
  });

  it('treats empty values as unset', () => {
    const env = lanEnv(
      { PUBLIC_BASE_URL: '', ADMIN_TOKEN: '' },
      '10.0.0.7',
      token,
    );
    expect(env.publicBaseUrl).toBe('http://10.0.0.7:3000');
    expect(env.generatedToken).toBe(true);
  });
});
