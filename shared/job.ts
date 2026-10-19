/** Facts about the best job match, read from the card's own lines when the routine writes them, else worked out from its text. */

export type WorkMode = "Remote" | "Hybrid" | "On-site";

export interface JobFacts {
  company: string | null;
  location: string | null;
  workMode: WorkMode | null;
  experience: string | null;
  skills: string[];
  posted: string | null;
}

interface JobInput {
  title: string;
  location?: string;
  postedText?: string;
  fields: { label: string; text: string }[];
  /** Requirements / qualifications text. */
  requirements?: string;
  fit?: string;
  source?: string;
  applyUrl?: string | null;
}

/** Placeholder answers such as "not named in the fetched excerpt" are not data. */
const NON_VALUE = /^(?:none|n\/a|na|unknown|unspecified|-+)$|\bnot (?:named|stated|specified|available|mentioned|listed|given)\b|\bexcerpt\b|\bfetched\b|\bsee the posting\b/i;

const field = (fields: JobInput["fields"], ...labels: string[]) => {
  const text = fields.find((f) => labels.some((l) => f.label.toLowerCase().startsWith(l)))?.text.trim();
  return text && !NON_VALUE.test(text) ? text : null;
};

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** "Greenhouse (databricks board)" gives "Databricks"; "Lever (cred)" gives "Cred"; "Google Careers" gives "Google". */
export function companyFromSource(source: string | undefined): string | null {
  if (!source) return null;
  const named = /\bboard[:\s]+([a-z0-9._-]+)/i.exec(source); // "Greenhouse API, board databricks"
  if (named) return titleCase(named[1]!.replace(/[-_.]+/g, " ").replace(/software ?private ?limited$/i, "").trim()) || null;
  const board = /\(\s*([a-z0-9._-]+?)(?:\s+board)?\s*\)/i.exec(source);
  if (board) return titleCase(board[1]!.replace(/[-_.]+/g, " ").replace(/software ?private ?limited$/i, "").trim()) || null;
  const careers = /^(.+?)\s+careers\b/i.exec(source);
  return careers ? careers[1]!.trim() : null;
}

const AGGREGATORS = /^(?:greenhouse|lever|ashbyhq|workable|workday|myworkdayjobs|smartrecruiters|linkedin|indeed|glassdoor|naukri|remoteok|arbeitnow|jobicy|himalayas|wellfound|angel|bamboohr|recruitee|breezy|icims|jobvite|taleo|example|bit|goo|t)$/i;

/** "https://job-boards.greenhouse.io/databricks/jobs/123" gives "Databricks"; lever and google careers links too. */
export function companyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (/greenhouse\.io$/.test(host) && first && first !== "embed") return titleCase(first.replace(/[-_]+/g, " "));
    if (/(^|\.)lever\.co$/.test(host) && first) return titleCase(first.replace(/[-_]+/g, " "));
    if (/ashbyhq\.com$/.test(host) && first) return titleCase(first.replace(/[-_]+/g, " "));
    if (/(^|\.)google\.com$/.test(host) && /careers/.test(u.pathname)) return "Google";
    // a company's own careers site: databricks.com gives "Databricks"
    const label = host.split(".").slice(-2, -1)[0] ?? "";
    if (label && !AGGREGATORS.test(label)) return titleCase(label.replace(/[-_]+/g, " "));
    return null;
  } catch {
    return null;
  }
}

export function workModeFrom(...texts: (string | undefined | null)[]): WorkMode | null {
  const t = texts.filter(Boolean).join(" ");
  if (/\bhybrid\b/i.test(t)) return "Hybrid";
  if (/\bremote\b|work from home|\bwfh\b/i.test(t)) return "Remote";
  if (/\bon-?site\b|in[- ]office|office[- ]based/i.test(t)) return "On-site";
  return null;
}

export function experienceFrom(text: string | undefined | null): string | null {
  if (!text) return null;
  const range = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i.exec(text);
  if (range) return `${range[1]}–${range[2]} yrs`;
  const plus = /(\d{1,2})\s*(\+)?\s*(?:years?|yrs?)(?:\s+of)?\b/i.exec(text);
  if (plus) return `${plus[1]}${plus[2] ?? "+"} yrs`;
  return null;
}

const SKILLS: [string, RegExp][] = [
  ["Go", /\bgolang\b|\bGo\b(?!\s+(?:to|for|with|beyond))/],
  ["Python", /\bpython\b/i], ["Java", /\bjava\b/i], ["Kotlin", /\bkotlin\b/i], ["Scala", /\bscala\b/i], ["Rust", /\brust\b/i],
  ["C++", /c\+\+/i], ["TypeScript", /\btypescript\b/i], ["Node.js", /\bnode(?:\.js)?\b/i],
  ["SQL", /\bsql\b/i], ["MySQL", /\bmysql\b/i], ["PostgreSQL", /\bpostgres(?:ql)?\b/i], ["Redis", /\bredis\b/i], ["DynamoDB", /\bdynamodb\b/i],
  ["Kafka", /\bkafka\b/i], ["Spark", /\bspark\b/i], ["Airflow", /\bairflow\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i], ["Docker", /\bdocker\b/i], ["Terraform", /\bterraform\b/i],
  ["AWS", /\baws\b/i], ["GCP", /\bgcp\b|google cloud/i], ["Azure", /\bazure\b/i],
  ["gRPC", /\bgrpc\b/i], ["REST APIs", /\brest(?:ful)?\b/i], ["Microservices", /\bmicroservices?\b/i],
  ["Distributed systems", /\bdistributed[- ]systems?\b/i], ["Linux", /\blinux\b/i],
];

export function skillsFrom(...texts: (string | undefined | null)[]): string[] {
  const t = texts.filter(Boolean).join(" ");
  return SKILLS.filter(([, re]) => re.test(t)).map(([name]) => name).slice(0, 10);
}

export function describeJob(j: JobInput): JobFacts {
  const listed = field(j.fields, "skills", "tech stack", "stack");
  const body = [j.title, j.requirements, j.fit].join(" ");
  return {
    company: field(j.fields, "company", "employer") ?? companyFromUrl(j.applyUrl) ?? companyFromSource(j.source),
    location: j.location?.trim() || field(j.fields, "location"),
    workMode: (field(j.fields, "work mode", "mode", "work type") as WorkMode | null) ?? workModeFrom(j.location, j.title, j.requirements, j.fit),
    experience: field(j.fields, "experience", "yoe") ?? experienceFrom(j.requirements) ?? experienceFrom(j.title),
    skills: listed ? listed.split(/\s*[,;·]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 10) : skillsFrom(body),
    posted: j.postedText?.trim() || null,
  };
}
