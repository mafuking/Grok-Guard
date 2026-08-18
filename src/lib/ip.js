import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const FETCH_MS = 8000;

async function text(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.text()).trim();
}

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function lookupEgress() {
  const errors = [];
  let ipv4 = null;
  let ipv6 = null;

  try {
    ipv4 = await text("https://api.ipify.org");
  } catch (err) {
    errors.push(`ipv4:${err.message}`);
  }

  try {
    ipv6 = await text("https://api64.ipify.org");
    if (ipv6 && !ipv6.includes(":")) ipv6 = null;
  } catch (err) {
    errors.push(`ipv6:${err.message}`);
  }

  const target = ipv4 || ipv6;
  let geo = {
    ip: target,
    country: null,
    countryCode: null,
    city: null,
    isp: null,
    org: null,
    as: null,
    asname: null,
    mobile: false,
    proxy: false,
    hosting: false,
  };

  if (target) {
    try {
      const data = await json(
        `http://ip-api.com/json/${encodeURIComponent(target)}?lang=zh-CN&fields=status,message,query,country,countryCode,regionName,city,isp,org,as,asname,mobile,proxy,hosting`,
      );
      if (data.status === "success") {
        const asn = String(data.as || "").match(/AS\d+/i)?.[0]?.toUpperCase() || data.asname || "";
        const isp = data.isp || data.org || "";
        geo = {
          ip: data.query,
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          region: data.regionName,
          isp,
          org: data.org && data.org !== isp ? data.org : "",
          as: asn,
          asname: data.asname,
          mobile: Boolean(data.mobile),
          proxy: Boolean(data.proxy),
          hosting: Boolean(data.hosting),
          locationText: [data.country, data.regionName, data.city].filter(Boolean).join(" · "),
          ispText: isp,
          asnText: asn,
        };
      } else {
        errors.push(`ip-api:${data.message || "fail"}`);
      }
    } catch (err) {
      errors.push(`ip-api:${err.message}`);
    }
  }

  const ipv6Leak = Boolean(ipv4 && ipv6 && ipv4 !== ipv6);
  return { ipv4, ipv6, ipv6Leak, geo, errors, checkedAt: new Date().toISOString() };
}
