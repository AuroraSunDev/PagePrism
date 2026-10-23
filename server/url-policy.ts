import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

export async function validatePublicUrl(input: string, resolve = async (host: string) => {
  const records = await lookup(host, { all: true, verbatim: true });
  return records.map(r => r.address);
}): Promise<URL> {
  if (input.length > 2048) throw new Error('网址太长，请使用公开页面的直接链接。');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('请输入完整的 http:// 或 https:// 网址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('只支持无登录凭证、使用标准端口的 HTTP／HTTPS 公开页面。');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (!host.includes('.') && !host.includes(':'))) {
    throw new Error('不能分析本机、内网或本地域名。');
  }
  let addresses: string[];
  try { addresses = ipaddr.isValid(host) ? [host] : await resolve(host); }
  catch { throw new Error('无法解析这个网站的地址，请检查网址或网络。'); }
  if (!addresses.length || addresses.some(address => !isPublicAddress(address))) {
    throw new Error('目标地址不属于可访问的公开网络。');
  }
  url.hash = '';
  return url;
}
