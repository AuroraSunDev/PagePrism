import { describe, expect, it } from 'vitest';
import { validatePublicUrl, isPublicAddress } from '../../server/url-policy';

const publicLookup = async () => ['93.184.216.34'];
describe('public-only URL policy', () => {
  it('normalizes public HTTPS without sending a request', async () => {
    expect((await validatePublicUrl('https://example.com/a#section', publicLookup)).href).toBe('https://example.com/a');
  });
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'https://a:b@example.com', 'https://example.com:3000', 'http://localhost', 'http://localhost.', 'http://test.local', 'http://127.1', 'http://0x7f000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://169.254.169.254'])('rejects forbidden target %s', async input => {
    await expect(validatePublicUrl(input, publicLookup)).rejects.toThrow();
  });
  it('rejects a host when any DNS result is private', async () => {
    await expect(validatePublicUrl('https://example.com', async () => ['93.184.216.34', '10.0.0.1'])).rejects.toThrow();
  });
  it('rejects unresolved hosts', async () => {
    await expect(validatePublicUrl('https://example.com', async () => [])).rejects.toThrow();
  });
  it.each(['0.0.0.0', '10.0.0.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '224.0.0.1', '198.18.0.1', '::', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1'])('does not treat %s as public', address => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it('accepts only global unicast IPs', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
});
