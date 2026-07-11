import { request } from "undici";

async function testUndiciWithoutEncoding() {
  console.log("Testing undici without accept-encoding...");
  const response = await request("https://www.jobs.nhs.uk/candidate/search/results?keyword=junior+clinical+fellow", {
    method: "GET",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
  });
  console.log("Status:", response.statusCode);
  const text = await response.body.text();
  console.log("Content start:", text.substring(0, 200));
}

async function testGlobalFetch() {
  console.log("\nTesting global fetch...");
  try {
    const response = await fetch("https://www.jobs.nhs.uk/candidate/search/results?keyword=junior+clinical+fellow", {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Content start:", text.substring(0, 200));
  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await testUndiciWithoutEncoding();
  await testGlobalFetch();
}

run();
