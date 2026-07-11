// Try various JobTrain POST endpoints to find job listings for NHS Scotland
const BASE = "https://apply.jobs.scot.nhs.uk";
const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://apply.jobs.scot.nhs.uk/Home/Job",
  origin: "https://apply.jobs.scot.nhs.uk",
};

async function tryEndpoint(path: string, body: string) {
  try {
    const url = BASE + path;
    console.log(`\nTrying POST ${url} with body: ${body.substring(0, 80)}`);
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();
    console.log(`Status: ${res.status}, Length: ${text.length}, Preview: ${text.substring(0, 200)}`);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function tryGet(path: string) {
  try {
    const url = BASE + path;
    console.log(`\nTrying GET ${url}`);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...headers,
        accept: "application/json, */*",
      }
    });
    const text = await res.text();
    console.log(`Status: ${res.status}, Length: ${text.length}, Preview: ${text.substring(0, 300)}`);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function run() {
  const keyword = "junior clinical fellow";
  const encoded = encodeURIComponent(keyword);

  // Common JobTrain API endpoints
  await tryEndpoint("/Home/GetJobsByFilter", `keywords=${encoded}&locationId=0&distance=0&clientId=0`);
  await tryEndpoint("/Home/Job", `keywords=${encoded}&locationId=0&distance=0&clientId=0`);
  await tryEndpoint("/api/JobSearch", `keywords=${encoded}`);
  await tryEndpoint("/Home/SearchJobResults", `keyword=${encoded}`);
  await tryGet(`/Home/GetAllVacancies?keywords=${encoded}`);
  await tryGet(`/api/jobs?keywords=${encoded}`);
  await tryGet(`/Home/Job?keywords=${encoded}&format=json`);
  await tryEndpoint("/Home/FilterJobs", `keywords=${encoded}&locationId=0&distance=0`);
  await tryEndpoint("/Jobs/GetJobs", `keywords=${encoded}`);
  await tryEndpoint("/Home/GetJobs", `keywords=${encoded}&locationId=0&distance=0&JobTypeId=0&clientId=0&page=1`);
}

run().catch(console.error);
