# Candidate Match Scoring Criteria

**What this document is:** the official rubric the platform uses to score every
candidate against a job description, and the exact formula that turns those
scores into the single 0–100 "Match Score" shown in the app. This is a
description of the *live* system — the weights and rules below are implemented
in `ai-service/agents/ranking_agent.py`, not a separate policy document that
the software might drift from. If the algorithm ever changes, this file is
updated in the same change.

**Where a candidate's score comes from:**
1. A job's description is parsed (once, at job-creation time) into a
   structured set of requirements: target designation, required skills,
   experience range, location, industry, education, and availability —
   augmented with any skills the recruiter typed in explicitly when creating
   the job.
2. Every candidate is compared against those requirements using nine
   independent sub-scores (0–100 each), described below.
3. The sub-scores are combined into one overall Match Score using fixed,
   published weights — not an LLM's subjective judgment. This makes scoring
   deterministic and repeatable: the same candidate against the same job
   requirements always produces the same score, and the score can always be
   explained by pointing at the specific sub-scores that drove it.

An AI model *is* used elsewhere in the pipeline (to read the job description
and the resume and turn free text into structured data), but the actual
scoring/ranking math below is plain, auditable arithmetic — no black box.

---

## The nine scoring dimensions

| # | Dimension | Weight | What it measures |
|---|-----------|-------:|-------------------|
| 1 | Skill Match | **20%** | Overlap between the job's required skills and the candidate's listed skills |
| 2 | Technology Match | **14%** | Overlap between required skills/keywords and the candidate's broader technology stack (tools used in real projects, not just self-listed skills) |
| 3 | Designation Match | **14%** | How closely the candidate's current/suitable job titles match the target role |
| 4 | Experience Match | **15%** | Whether the candidate's total years of experience falls inside the job's required range |
| 5 | Industry Match | **9%** | Overlap between the job's industry/domain keywords and the candidate's employment history |
| 6 | Education Match | **8%** | Overlap between the job's education requirement and the candidate's degrees/institutions |
| 7 | Location Match | **8%** | Whether the candidate is based where the role requires (or the role is remote) |
| 8 | Availability Match | **7%** | Whether the candidate can join within the timeframe the role needs |
| 9 | Resume Freshness | **5%** | How recently the candidate's profile was added — a light tie-breaker only |

**Weights sum to 100%.** They are fixed constants, not tuned per job or per
recruiter, so every candidate is held to the same standard for the same job.

If a job description doesn't specify a particular requirement (e.g. no
location was mentioned), that dimension is scored neutral (50/100) rather
than counted for or against the candidate — an unstated requirement can't be
failed.

---

### 1. Skill Match (20%)

Compares the job's `requiredSkills` list against the candidate's listed
primary + secondary skills. Each required skill earns:

- **Full credit** for an exact match, or a known equivalent spelling/alias
  (e.g. "JS" = "JavaScript", "ReactJS" = "React", "K8s" = "Kubernetes",
  "Postgres" = "PostgreSQL"). A maintained alias table covers the common
  recruiting-tech spelling variants.
- **Partial credit (0.85×)** for a close typo-level match only — e.g. a minor
  spelling difference.
- **No credit** otherwise.

The final score is the percentage of required skills that were matched.

> Deliberately *not* a raw substring check (e.g. treating "Java" as present
> whenever the text contains "JavaScript"). That approach produces false
> positives on skill pairs that share a prefix but are unrelated —
> Java/JavaScript, C/C++/C#, Go/Django — so it was replaced with exact +
> alias + typo-distance matching.

### 2. Technology Match (14%)

Same matching logic as Skill Match, applied instead to the candidate's
`technologyStack` (tools/frameworks extracted from their actual project and
work history, distinct from the skills they self-listed) against the job's
required skills plus any extra free-text keywords from the description. This
rewards candidates who have *used* the required technology in practice, as a
complement to Skill Match.

### 3. Designation Match (14%)

Compares the job's target designation (e.g. "Senior Backend Engineer")
against the candidate's current role and their AI-suggested suitable roles,
using text-similarity matching with a boost when one title contains the
other (e.g. "Engineer" inside "Software Engineer"). Rewards close title
matches without requiring an exact string match.

### 4. Experience Match (15%)

- **100** if the candidate's total years of experience falls within the
  job's stated min–max range.
- Outside the range, the score decays by **15 points per year** of distance
  from the nearest bound (e.g. 2 years under the minimum → 70), floored at 0.
- If the recruiter only gives a minimum (e.g. "5+ years"), the system treats
  it as a soft band rather than an infinite perfect range: min to min+5 years
  for experienced roles, or min to min+2 years for junior roles. Candidates
  above that soft band are still valid but lose **8 points per extra year** so
  heavily over-qualified profiles do not all display 100% Experience Match.

This makes under-qualified candidates visibly lower while still applying a
lighter over-qualification penalty when a candidate is far above the requested
range or soft band.

### 5. Industry Match (9%)

Keyword overlap between the job's explicit industry/domain terms (e.g.
"fintech", "healthcare") and the candidate's previous employers and role
descriptions. If no explicit industry/domain is present, this dimension stays
neutral rather than reusing generic skills/role keywords as false industry
evidence.

### 6. Education Match (8%)

Keyword overlap between the job's stated education requirement (e.g.
"B.Tech", "MBA", "Computer Science degree") and the candidate's degrees,
fields of study, and institutions.

### 7. Location Match (8%)

- **100** if the role is remote/open-location, or the candidate's location
  matches the job's required location (including common city-name variants,
  e.g. Bangalore/Bengaluru, Gurgaon/Gurugram, Mumbai/Bombay).
- A **partial score** for a close-but-not-exact text match (e.g. same
  metro region under different phrasing).
- **20** (not zero) for a clearly different city — relocation and hybrid
  arrangements are common enough that a location mismatch is a signal, not a
  disqualifier.
- **Neutral (50)** if the candidate's location isn't on file, so missing
  data is never penalized as if it were a bad match.

### 8. Availability Match (7%)

Compares how soon the role needs someone against how soon the candidate can
join (parsed from phrases like "Immediate", "Notice period: 30 days",
"Available from ..."):

- **100** if the candidate can join at or before the required timeframe.
- Decays **10 points per week** of delay beyond what the role needs.
- **40** if the candidate's availability isn't on file (an unknown, not
  automatically disqualifying).
- **Neutral (50)** if the job description didn't specify an urgency at all.

### 9. Resume Freshness (5%)

A small tie-breaker favoring more recently-added profiles (100 within 30
days, decaying to 25 beyond 90 days), on the reasoning that a very old
profile is more likely to be stale (candidate already placed elsewhere,
outdated contact details, etc.). Intentionally the lowest-weighted
dimension — it should only matter when candidates are otherwise close.

---

## How the final score is calculated

```
Match Score =  (Skill Match        × 0.20)
             + (Technology Match   × 0.14)
             + (Designation Match  × 0.14)
             + (Experience Match   × 0.15)
             + (Industry Match     × 0.09)
             + (Education Match    × 0.08)
             + (Location Match     × 0.08)
             + (Availability Match × 0.07)
             + (Resume Freshness   × 0.05)
```

Rounded to one decimal place, clamped to the 0–100 range.

## Interpreting the score

| Score | Interpretation |
|------:|----------------|
| 85–100 | Excellent fit — strong alignment across nearly every dimension |
| 70–84  | Strong fit — meets the core requirements with minor gaps |
| 50–69  | Moderate fit — worth a look, but has real gaps against the JD |
| Below 50 | Weak fit — significant mismatch on one or more major dimensions |

The full sub-score breakdown (all nine dimensions) is always available
alongside the overall number, so a recruiter can see *why* a candidate scored
the way they did — e.g. a candidate can score high overall on skills and
experience while still showing a low Location Match, which is a very
different situation from an across-the-board weak match.

## What this scoring deliberately does **not** use

The rubric only draws on job-relevant signals already listed above. It does
not use — and the underlying data model does not even capture — a
candidate's name, gender, age, photo, or any other characteristic unrelated
to their ability to do the job. This is by design, not an omission.

## Two different scores you'll see in the app

- **Match Score** (this document) — computed by the rubric above, always
  against one specific job's requirements. This is what changes if you move
  a candidate to a different job listing.
- **AI Rating** — a separate, general-purpose quality score an AI model
  assigns once when a resume is first processed (based on the resume's
  overall strength, independent of any specific job). It does not change
  when a candidate is reassigned between jobs, and it is not part of the
  Match Score formula above.
