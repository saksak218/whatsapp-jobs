import assert from "node:assert/strict";
import { config } from "../config.js";
import {
  getMatchingKeywords,
  parseRenderedTracJobsMarkdown,
} from "../scrapers/helpers.js";
import type { NormalizedJob } from "../scrapers/types.js";

function job(
  title: string,
  classificationText?: string,
  source: NormalizedJob["source"] = "jobs-nhs-uk",
): NormalizedJob {
  return {
    job_id: `test:${title}`,
    source,
    title,
    url: "https://www.jobs.nhs.uk/candidate/jobadvert/test",
    classification_text: classificationText,
  };
}

function assertIncluded(candidate: NormalizedJob): void {
  assert.notEqual(
    getMatchingKeywords(candidate, config.searchKeywords).length,
    0,
    `Expected junior-accessible job to match: ${candidate.title}`,
  );
}

function assertExcluded(candidate: NormalizedJob): void {
  assert.equal(
    getMatchingKeywords(candidate, config.searchKeywords).length,
    0,
    `Expected senior-only job to be excluded: ${candidate.title}`,
  );
}

assertExcluded(
  job(
    "Clinical Fellow - Acute Medicine",
    "Applicants must have a minimum of two years after completion of internship.",
  ),
);
assertIncluded(
  job(
    "Clinical Fellow - Acute Medicine",
    "Applicants must have a minimum of two years after completion of internship.",
    "nhs-scotland",
  ),
);
assertIncluded(
  job(
    "Trust Doctor in Neurology",
    "This post is suitable for candidates at ST1-ST5 level.",
  ),
);
assertIncluded(job("Simulation Fellow", "Applicants must have completed FY1 and FY2."));
assertIncluded(job("Resident Doctor ST1/ST2", "Completion of the Foundation Programme is essential."));
assertIncluded(job("Junior Clinical Fellow in Emergency Medicine"));
assertIncluded(job("Junior Clinical Fellow in Emergency Medicine", undefined, "healthjobsuk"));
assertIncluded(job("Clinical Fellow ST1/ST2 in Urology", undefined, "healthjobsuk"));
assertIncluded(job("Medical Education Fellow", undefined, "healthjobsuk"));
assertIncluded(job("FY3 Doctor in General Surgery", undefined, "healthjobsuk"));
assertIncluded(job("Clinical Research Fellow in Dermatology"));
assertIncluded(job("Senior House Officer - General Medicine"));
assertIncluded(job("Locally Employed Doctor"));
assertExcluded(job("Clinical Fellow ST1-ST5"));
assertIncluded(job("Clinical Fellow ST1-ST5", undefined, "nhs-scotland"));

assertExcluded(job("Senior Clinical Fellow in Cardiology"));
assertExcluded(job("Clinical Fellow ST3 Equivalent"));
assertExcluded(job("Trust Registrar in General Surgery"));
assertExcluded(job("Specialty Doctor in Psychiatry"));
assertExcluded(job("Locum Consultant in Acute Medicine"));
assertExcluded(job("Locally Employed Doctor", "This post is suitable at ST4 equivalent level."));
assertExcluded(job("Clinical Fellow NHS Medical & Dental: Local Appointment nodal point 4 (MT04)"));
assertExcluded(job("Fixed Term Service Appointment in Dermatology (ST4+) NHS Medical & Dental: Junior Clinical Fellow"));
assertExcluded(job("Staff Nurse - Short Stay Admission Ward / Head Injuries"));
assertExcluded(job("Training Programme Director - O&G ST1 & Teaching Lead"));

const renderedJobs = parseRenderedTracJobsMarkdown(
  '1. [Junior Clinical Fellow](http://www.healthjobsuk.com/job/UK/Test/Trust/Speciality/Speciality-v1234567 "Junior Clinical Fellow")',
  "healthjobsuk",
  "https://www.healthjobsuk.com",
  "https://www.healthjobsuk.com/job_list?JobSearch_q=Fellow",
  "Fellow",
);
assert.equal(renderedJobs.length, 1, "Expected rendered HTTP job links to parse");
assert.equal(
  renderedJobs[0]?.url,
  "https://www.healthjobsuk.com/job/UK/Test/Trust/Speciality/Speciality-v1234567",
  "Expected rendered job links to be normalized to HTTPS",
);

console.log("Junior-doctor matching regression tests passed.");
