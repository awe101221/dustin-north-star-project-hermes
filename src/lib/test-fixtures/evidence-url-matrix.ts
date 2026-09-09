export const acceptedEvidenceUrls = [
  "https://www.sec.gov/Archives/example?x=1#source",
  "HTTPS://WWW.SEC.GOV/Archives/example",
  "https://example.com/outcome",
] as const;

export const reservedEvidenceUrls = [
  "https://foo.localhost/outcome",
  "https://deep.foo.localhost/outcome",
  "https://device.local/outcome",
  "https://evidence.test/outcome",
  "https://evidence.invalid/outcome",
  "https://evidence.example/outcome",
  "https://hidden.onion/outcome",
  "https://corp.internal/outcome",
  "https://router.lan/outcome",
  "https://server.home/outcome",
  "https://host.localdomain/outcome",
] as const;

export const rejectedEvidenceUrls = [
  "http://example.com/outcome",
  "javascript:alert(1)",
  "data:text/plain,outcome",
  "file:///tmp/outcome",
  "https://user:password@example.com/outcome",
  "https://localhost/outcome",
  ...reservedEvidenceUrls,
  "https://example/outcome",
  "https://a.b/outcome",
  "https://bad_host.example.com/outcome",
  "https://-bad.example.com/outcome",
  "https://bad-.example.com/outcome",
  "https://example..com/outcome",
  "https://8.8.8.8/outcome",
  "https://10.0.0.1/outcome",
  "https://192.168.1.1/outcome",
  "https://127.0.0.1/outcome",
  "https://999.999.999.999/outcome",
  "https://[::1]/outcome",
  "https://[2001:4860:4860::8888]/outcome",
] as const;
