// Test various approaches to get healthjobsuk.com and nhsjobs.com results
const HEALTH_JOBS_UK = "https://www.healthjobsuk.com";
const NHS_JOBS_COM = "https://www.nhsjobs.com";

// Different referer+header combinations to defeat 403
async function tryFetch(name: string, url: string, extraHeaders: Record<string, string> = {}) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-GB,en;q=0.9",
    ...extraHeaders,
  };
  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "follow" });
    const text = await res.text();
    const preview = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 200);
    console.log(`\n[${name}] Status: ${res.status}, Size: ${text.length}, Preview: ${preview}`);
    if (res.status === 200 && text.length > 5000) {
      const fs = await import("fs");
      fs.writeFileSync(`tmp-${name}.html`, text);
      console.log(`  Saved to tmp-${name}.html`);
    }
  } catch (e) {
    console.error(`[${name}] Error: ${e instanceof Error ? e.message : e}`);
  }
}

async function run() {
  const keyword = "junior clinical fellow";
  const kw = encodeURIComponent(keyword);

  // HealthJobsUK attempts - different URLs
  await tryFetch("hjuk-v1", `${HEALTH_JOBS_UK}/job_list?JobSearch_q=${kw}&JobSearch_Submit=Search&_tr=JobSearch`, { referer: "https://www.healthjobsuk.com/" });
  await tryFetch("hjuk-v2", `${HEALTH_JOBS_UK}/job_list?q=${kw}`, { referer: "https://www.healthjobsuk.com/" });
  await tryFetch("hjuk-home", `${HEALTH_JOBS_UK}/`, {});

  // nhsjobs.com attempts - different URLs
  await tryFetch("nhsjobs-search", `${NHS_JOBS_COM}/search-jobs/${kw.replace(/%20/g, "-")}`, { referer: "https://www.nhsjobs.com/" });
  await tryFetch("nhsjobs-v2", `${NHS_JOBS_COM}/search?q=${kw}`, { referer: "https://www.nhsjobs.com/" });
  await tryFetch("nhsjobs-v3", `${NHS_JOBS_COM}/search?keywords=${kw}`, { referer: "https://www.nhsjobs.com/" });
  await tryFetch("nhsjobs-home", `${NHS_JOBS_COM}/`, {});
}

run().catch(console.error);
