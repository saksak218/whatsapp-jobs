export type JobSource =
  | "healthjobsuk"
  | "jobs-nhs-uk"
  | "nhs-scotland"
  | "nhsjobs-com"
  | "hscni";

export interface NormalizedJob {
  job_id: string;
  source: JobSource;
  title: string;
  employer?: string;
  location?: string;
  salary?: string;
  url: string;
  /** Extra advert text used only while classifying a freshly scraped job. */
  classification_text?: string;
  posted_at?: Date;
  closing_at?: Date;
  raw?: unknown;
}

export type Scraper = () => Promise<NormalizedJob[]>;
