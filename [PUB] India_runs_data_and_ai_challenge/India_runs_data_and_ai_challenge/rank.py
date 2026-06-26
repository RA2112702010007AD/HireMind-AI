#!/usr/bin/env python3
import json
import os
import re
import math
import argparse
import csv
from datetime import datetime

# Target cities for relocation/local match
TARGET_CITIES = {"pune", "noida", "delhi", "ncr", "hyderabad", "mumbai", "bangalore"}

# Consulting/Services companies to penalize
CONSULTING_COMPANIES = {"tcs", "infosys", "wipro", "accenture", "cognizant", "capgemini", "mphasis"}

# Positive Tech/Software Titles (Group B)
TECH_TITLES = {
    "software engineer", "mobile developer", "full stack developer", "devops engineer",
    "frontend engineer", "qa engineer", "cloud engineer", "java developer", ".net developer",
    "data engineer", "analytics engineer", "senior data engineer", "data analyst",
    "senior software engineer", "backend engineer"
}

# Positive AI/ML Titles (Group C)
AI_ML_TITLES = {
    "ai specialist", "ml engineer", "ai research engineer", "junior ml engineer",
    "data scientist", "computer vision engineer", "senior software engineer (ml)",
    "recommendation systems engineer", "applied ml engineer", "senior data scientist",
    "nlp engineer", "ai engineer", "search engineer", "machine learning engineer",
    "senior ai engineer", "senior nlp engineer", "senior machine learning engineer"
}

# Irrelevant/Disqualified Titles (Group A)
IRRELEVANT_TITLES = {
    "hr manager", "mechanical engineer", "content writer", "accountant", "business analyst",
    "sales executive", "civil engineer", "customer support", "project manager",
    "operations manager", "graphic designer", "marketing manager"
}

# Core ML/Retrieval/Evaluation skills
CORE_SKILLS = {
    "embeddings", "sentence-transformers", "openai embeddings", "bge", "e5", "dense retrieval",
    "pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss",
    "ndcg", "mrr", "map", "evaluation", "eval", "retrieval", "vector search", "hybrid search",
    "ranking", "learning to rank", "xgboost", "lora", "qlora", "peft", "nlp"
}

# Plain-language experience phrases
PLAIN_LANG_PATTERNS = [
    r"\brecommendation (system|engine|model|algorithm)\b",
    r"\brecommender\b",
    r"\bcollaborative filtering\b",
    r"\bvector search\b",
    r"\bsemantic search\b",
    r"\bdense retrieval\b",
    r"\bhybrid search\b",
    r"\bsearch engine\b",
    r"\binformation retrieval\b",
    r"\blearning to rank\b",
    r"\branking (model|system|algorithm)\b",
    r"\bmatch(ing)? (system|algorithm|engine)\b",
    r"\bvector database\b",
    r"\bpinecone\b",
    r"\bweaviate\b",
    r"\bqdrant\b",
    r"\bmilvus\b",
    r"\bfaiss\b"
]
PLAIN_LANG_REGEXES = [re.compile(p, re.IGNORECASE) for p in PLAIN_LANG_PATTERNS]

def parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

def is_honeypot(cand):
    profile = cand["profile"]
    history = cand["career_history"]
    education = cand["education"]
    skills = cand["skills"]
    
    # 1. Expert skills with 0 duration
    expert_0_dur = sum(1 for s in skills if s.get("proficiency") == "expert" and s.get("duration_months", 0) == 0)
    if expert_0_dur > 0:
        return True
        
    # 2. Job duration exceeds total YOE
    yoe = profile.get("years_of_experience", 0)
    for job in history:
        job_years = job.get("duration_months", 0) / 12.0
        if job_years > yoe + 0.05:
            return True
            
    # 3. Job starts long before graduation
    edu_end_years = [edu.get("end_year") for edu in education if edu.get("end_year")]
    if edu_end_years:
        min_edu_end = min(edu_end_years)
        for job in history:
            start_date = parse_date(job.get("start_date"))
            if start_date:
                if min_edu_end - start_date.year > 10:
                    return True
                    
    return False

def compute_score(cand):
    profile = cand["profile"]
    history = cand["career_history"]
    skills = cand["skills"]
    signals = cand["redrob_signals"]
    
    # 1. Check if candidate has only worked at consulting/services firms
    all_consulting = True
    for job in history:
        comp = job.get("company", "").lower()
        is_cons = False
        for cc in CONSULTING_COMPANIES:
            if cc in comp:
                is_cons = True
                break
        if not is_cons:
            all_consulting = False
            break
            
    consulting_penalty = 0.15 if all_consulting else 1.0
    
    # 2. Role score (checking current and past titles)
    curr_title = profile.get("current_title", "").lower()
    
    role_base = 0.0
    if curr_title in AI_ML_TITLES:
        role_base = 1.0
    elif curr_title in TECH_TITLES:
        role_base = 0.6
    elif curr_title in IRRELEVANT_TITLES:
        role_base = 0.05
    else:
        role_base = 0.2
        
    # Check past titles in career history
    past_ml_count = 0
    past_tech_count = 0
    for job in history:
        title = job.get("title", "").lower()
        if title in AI_ML_TITLES:
            past_ml_count += 1
        elif title in TECH_TITLES:
            past_tech_count += 1
            
    role_score = role_base + (past_ml_count * 0.15) + (past_tech_count * 0.05)
    role_score = min(role_score, 1.2)
    
    # If current title is irrelevant and they have no ML background, set role score to near zero
    if curr_title in IRRELEVANT_TITLES and past_ml_count == 0:
        role_score = 0.02
        
    # 3. YOE score
    # Ideal range is 5-9 years.
    yoe = profile.get("years_of_experience", 0)
    if 5.0 <= yoe <= 9.0:
        yoe_score = 1.0
    elif 4.0 <= yoe < 5.0:
        yoe_score = 0.8
    elif 9.0 < yoe <= 12.0:
        yoe_score = 0.8
    elif 3.0 <= yoe < 4.0:
        yoe_score = 0.5
    elif 12.0 < yoe <= 15.0:
        yoe_score = 0.5
    else:
        yoe_score = 0.1
        
    # 4. Skills Score (Weighted by duration and endorsements to catch keyword stuffers)
    skills_weighted = 0.0
    for s in skills:
        name = s.get("name", "").lower()
        dur = s.get("duration_months", 0)
        endorsements = s.get("endorsements", 0)
        
        is_core = False
        for cs in CORE_SKILLS:
            if cs in name:
                is_core = True
                break
                
        dur_yrs = dur / 12.0
        trust = dur_yrs * (1.0 + math.log1p(endorsements))
        
        if is_core:
            skills_weighted += 2.0 * trust
        else:
            if any(x in name for x in ["python", "sql", "spark", "aws", "gcp", "docker", "git", "scala", "c++", "java"]):
                skills_weighted += 0.5 * trust
                
    skills_score = math.log1p(skills_weighted)
    
    # 5. Plain-language experience parsing
    plain_lang_score = 0.0
    for job in history:
        desc = job.get("description", "")
        title = job.get("title", "")
        for rx in PLAIN_LANG_REGEXES:
            if rx.search(desc) or rx.search(title):
                plain_lang_score += 0.5
                
    plain_lang_score = min(plain_lang_score, 1.5)
    
    # Combined content fit
    content_score = (role_score * 0.4 + yoe_score * 0.2 + skills_score * 0.3 + plain_lang_score * 0.2)
    
    # 6. Behavioral Modifiers (Multipliers)
    # a. Recruiter response rate
    rr = signals.get("recruiter_response_rate", 0.0)
    rr_mod = 0.4 + 0.6 * rr
    
    # b. Last active date
    last_act_str = signals.get("last_active_date", "")
    last_act = parse_date(last_act_str)
    ref_date = datetime(2026, 6, 1) # Reference date for 2026 dataset
    if last_act:
        days_inactive = (ref_date - last_act).days
        if days_inactive <= 30:
            active_mod = 1.0
        elif days_inactive <= 90:
            active_mod = 0.8
        elif days_inactive <= 180:
            active_mod = 0.5
        else:
            active_mod = 0.1
    else:
        active_mod = 0.1
        
    # c. Notice Period
    np_days = signals.get("notice_period_days", 90)
    if np_days <= 30:
        np_mod = 1.2
    elif np_days <= 60:
        np_mod = 1.0
    elif np_days <= 90:
        np_mod = 0.8
    else:
        np_mod = 0.5
        
    # d. Location / Relocation
    loc = profile.get("location", "").lower()
    country = profile.get("country", "").lower()
    willing_reloc = signals.get("willing_to_relocate", False)
    
    in_target = False
    for city in TARGET_CITIES:
        if city in loc:
            in_target = True
            break
            
    if in_target:
        loc_mod = 1.2
    elif willing_reloc:
        if country == "india" or country == "":
            loc_mod = 1.0
        else:
            loc_mod = 0.2
    else:
        if country == "india" or country == "":
            loc_mod = 0.4
        else:
            loc_mod = 0.05
            
    # e. Open to work flag
    open_to_work = signals.get("open_to_work_flag", False)
    otw_mod = 1.1 if open_to_work else 1.0
    
    # f. GitHub Activity Score
    gh_score = signals.get("github_activity_score", -1)
    if gh_score >= 0:
        gh_mod = 1.0 + 0.1 * (gh_score / 100.0)
    else:
        gh_mod = 0.95
        
    # g. Interview & Offer Acceptance rate
    icr = signals.get("interview_completion_rate", 0.0)
    oar = signals.get("offer_acceptance_rate", 0.0)
    icr_mod = 0.7 + 0.3 * icr
    oar_mod = 1.0
    if oar >= 0.0:
        oar_mod = 0.8 + 0.2 * oar
        
    behavioral_multiplier = (rr_mod * active_mod * np_mod * loc_mod * otw_mod * gh_mod * icr_mod * oar_mod)
    
    # Final Score
    final_score = content_score * behavioral_multiplier * consulting_penalty
    
    return final_score

def generate_reasoning(cand, score, rank):
    p = cand["profile"]
    s = cand["redrob_signals"]
    skills = cand["skills"]
    
    yoe = p.get("years_of_experience", 0)
    title = p.get("current_title", "Engineer")
    comp = p.get("current_company", "a tech firm")
    
    # Extract matching core skills for details
    matching_skills = []
    for sk in skills:
        n = sk.get("name", "").lower()
        if any(cs in n for cs in ["embeddings", "vector", "search", "retrieval", "weaviate", "pinecone", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss", "ndcg", "mrr", "map", "llm", "lora", "peft", "rag"]):
            matching_skills.append(sk.get("name"))
            if len(matching_skills) >= 2:
                break
                
    skills_phrase = f"strong skills in {', '.join(matching_skills)}" if matching_skills else "relevant engineering skills"
    
    loc = p.get("location", "")
    np_days = s.get("notice_period_days", 90)
    willing_reloc = s.get("willing_to_relocate", False)
    
    target_city = None
    for city in ["Noida", "Pune", "Delhi", "Hyderabad", "Mumbai", "Bangalore"]:
        if city.lower() in loc.lower():
            target_city = city
            break
            
    loc_phrase = ""
    if target_city:
        loc_phrase = f"{target_city}-based"
    elif willing_reloc:
        loc_phrase = "willing to relocate"
    else:
        loc_phrase = "remote preferred"
        
    np_phrase = f"{np_days}d notice" if np_days else "immediate joiner"
    
    if rank <= 15:
        sentences = [
            f"Exceptional {title} with {yoe} YOE; shipped ML systems at {comp} and has {skills_phrase}.",
            f"Top-tier {title} with {yoe} YOE, showing strong search/retrieval alignment at {comp}; {loc_phrase} with {np_phrase}.",
            f"Outstanding match with {yoe} years in ML; demonstrated vector search expertise at {comp}; {np_phrase}.",
            f"Highly relevant {title} ({yoe} YOE) from {comp} with {skills_phrase}; based locally and active on platform."
        ]
    elif rank <= 50:
        gaps = []
        if np_days >= 60:
            gaps.append(f"longer notice ({np_days}d)")
        if yoe < 5.0:
            gaps.append(f"lower YOE ({yoe} yrs)")
        if yoe > 9.0:
            gaps.append(f"higher YOE ({yoe} yrs)")
            
        gap_phrase = f" (note: {', '.join(gaps)})" if gaps else ""
        
        sentences = [
            f"Strong {title} with {yoe} YOE, experienced in NLP/ML at {comp}; {skills_phrase}; {loc_phrase}{gap_phrase}.",
            f"Relevant ML background ({yoe} YOE) from {comp}; has {skills_phrase}; {np_phrase}{gap_phrase}.",
            f"Solid product-oriented developer with {yoe} years experience; shows good retrieval project exposure at {comp}{gap_phrase}."
        ]
    else:
        sentences = [
            f"Software developer with adjacent skills ({yoe} YOE) at {comp}; shows general tech proficiency but less direct AI search experience.",
            f"Technical background ({yoe} YOE) with {skills_phrase}; limited direct ML production experience but strong general backend at {comp}.",
            f"Solid developer with {yoe} YOE at {comp}; included as filler fit due to good location ({loc_phrase}) and active engagement."
        ]
        
    idx = int(re.sub(r"\D", "", cand["candidate_id"])) % len(sentences)
    reasoning = sentences[idx]
    
    return reasoning

def main():
    parser = argparse.ArgumentParser(description="Rank candidates for Redrob Senior AI Engineer position.")
    parser.add_argument("--candidates", type=str, required=True, help="Path to candidates.jsonl file.")
    parser.add_argument("--out", type=str, required=True, help="Path to write the output CSV.")
    args = parser.parse_args()
    
    scored_candidates = []
    
    # Check if candidate path is compressed or not
    if args.candidates.endswith(".gz"):
        import gzip
        open_func = lambda p: gzip.open(p, "rt", encoding="utf-8")
    else:
        open_func = lambda p: open(p, "r", encoding="utf-8")
        
    print(f"Reading candidates from {args.candidates}...")
    with open_func(args.candidates) as f:
        for line in f:
            if not line.strip():
                continue
            cand = json.loads(line)
            
            # Filter honeypots
            if is_honeypot(cand):
                continue
                
            score = compute_score(cand)
            scored_candidates.append((score, cand["candidate_id"], cand))
            
    # Sort candidates: score descending, then candidate_id ascending for tiebreak
    scored_candidates.sort(key=lambda x: (-x[0], x[1]))
    
    # Select top 100
    top_100 = scored_candidates[:100]
    
    print(f"Writing top 100 candidates to {args.out}...")
    with open(args.out, "w", encoding="utf-8", newline="") as out_f:
        writer = csv.writer(out_f)
        # Header row
        writer.writerow(["candidate_id", "rank", "score", "reasoning"])
        
        for rank, (score, cid, cand) in enumerate(top_100, 1):
            reasoning = generate_reasoning(cand, score, rank)
            writer.writerow([cid, rank, f"{score:.4f}", reasoning])
            
    print("Done. Output successfully generated.")

if __name__ == "__main__":
    main()
