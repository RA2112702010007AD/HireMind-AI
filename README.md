# Redrob Candidate Discovery & Ranking System

This repository contains the candidate discovery and ranking system designed for the **Senior AI Engineer — Founding Team** role.

## Reproduction & Execution

The ranking system is designed to run with **zero external dependencies** (using standard Python libraries only).

### Step 1: Run the Ranker

To process the candidate pool and generate the top 100 ranking CSV, execute the following command:

```bash
python rank.py --candidates ./candidates.jsonl --out ./team_antigravity.csv
```

**Expected Console Output:**
```text
Reading candidates from ./candidates.jsonl...
Writing top 100 candidates to ./team_antigravity.csv...
Done. Output successfully generated.
```

### Step 2: Validate the Output CSV

To verify the generated file format against all challenge constraints, run the hackathon format validator:

```bash
python validate_submission.py team_antigravity.csv
```

**Expected Console Output:**
```text
Submission is valid.
```

---

## Technical Architecture

The ranking system employs a structured, multi-tier approach to match candidates against the job description (JD) while actively dodging dataset traps:

```
[Candidate Pool] 
       │
       ▼
 1. Honeypot Filter ────────► [Disqualified / Removed]
       │ (Valid Profiles)
       ▼
 2. Scoring Engine
    ├── Role Alignment Score (AI/ML vs. Tech vs. Irrelevant)
    ├── Target YOE Alignment (Ideally 5-9 years)
    ├── Weighted Skills Score (Weighted by duration & endorsements)
    └── Plain-Language Boost (Extracts semantic search/recommender experience)
       │
       ▼
 3. Behavioral Modifiers (Multipliers)
    ├── Recruiter Response Rate
    ├── Platform Activity Recency
    ├── Notice Period Preference
    ├── Location & Relocation Willingness
    └── GitHub Contribution Score
       │
       ▼
 4. Sort & Deterministic Tie-Breaker (Candidate ID Ascending)
       │
       ▼
 5. Reasoning Generator (Fact-driven, no hallucinations)
       │
       ▼
[team_antigravity.csv]
```

### 1. Honeypot Filter (Hard Constraints)
We filter out all 105 honeypots (impossible profiles) using three strict validation checks:
- **Skill Duration Check:** Eliminates profiles claiming "expert" status on a skill with `0 months` duration.
- **Experience Duration Check:** Eliminates profiles where a single job duration exceeds the candidate's total years of experience.
- **Graduation Alignment Check:** Eliminates profiles where a senior career starts more than 10 years prior to the graduation year of their highest/only degree.

### 2. Custom Scoring Engine
- **Role Alignment Score (40%):** Heavily favors AI/ML specific titles. Downweights general tech roles and assigns near-zero scores to irrelevant roles (e.g., Marketing Managers, HR Managers) to neutralize keyword-stuffers.
- **Experience Years Score (20%):** Peaks for the target 5-9 YOE range. Evaluates surrounding ranges (4-5 and 9-12) with a minor discount, and penalizes entry-level or over-experienced developers.
- **Weighted Skills Score (30%):** Employs an endorsement-and-duration trust multiplier to score skills. Lazy keyword-stuffers who list skills with zero or low duration receive zero score, while high-endorsement, long-duration skills are rewarded.
- **Plain-Language Experience Boost (20%):** Searches career history descriptions for search, retrieval, ranking, and recommender terms to find fits who don't list trendy buzzwords.
- **Consulting Company Penalty:** Applies a 0.15 multiplier penalty if a candidate has *only* worked at IT consulting/services firms (TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, Mphasis), adhering to the JD's preference.

### 3. Behavioral Multipliers
Adjusts the candidate's content alignment score using active engagement signals:
- **Response Rate:** Multiplies by responsiveness to recruiter messages.
- **Activity Recency:** penalizes candidates inactive for more than 3-6 months.
- **Notice Period:** Rewards sub-30-day notice periods, and penalizes periods > 90 days.
- **Location Alignment:** Prefers candidates in hybrid-office locations (Pune, Noida, Delhi NCR, Mumbai, Hyderabad) or those willing to relocate. Heavily downweights international candidates requiring visa sponsorship.
- **GitHub activity:** Rewards active contributions and PRs.

### 4. Reasoning Generator
Programmatically constructs tailored, fact-driven 1-2 sentence reasonings specific to the candidate's actual years of experience, current title, company, skills, notice period, and location (with honest gaps where applicable). Picked deterministically using candidate ID to ensure high variation without randomness.
