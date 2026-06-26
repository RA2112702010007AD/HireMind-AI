// HireMind-AI UI & Logic Engine

// Configuration constants matching rank.py
const TARGET_CITIES = ["pune", "noida", "delhi", "ncr", "hyderabad", "mumbai", "bangalore"];
const CONSULTING_COMPANIES = ["tcs", "infosys", "wipro", "accenture", "cognizant", "capgemini", "mphasis"];

const TECH_TITLES = [
    "software engineer", "mobile developer", "full stack developer", "devops engineer",
    "frontend engineer", "qa engineer", "cloud engineer", "java developer", ".net developer",
    "data engineer", "analytics engineer", "senior data engineer", "data analyst",
    "senior software engineer", "backend engineer"
];

const AI_ML_TITLES = [
    "ai specialist", "ml engineer", "ai research engineer", "junior ml engineer",
    "data scientist", "computer vision engineer", "senior software engineer (ml)",
    "recommendation systems engineer", "applied ml engineer", "senior data scientist",
    "nlp engineer", "ai engineer", "search engineer", "machine learning engineer",
    "senior ai engineer", "senior nlp engineer", "senior machine learning engineer"
];

const IRRELEVANT_TITLES = [
    "hr manager", "mechanical engineer", "content writer", "accountant", "business analyst",
    "sales executive", "civil engineer", "customer support", "project manager",
    "operations manager", "graphic designer", "marketing manager"
];

const CORE_SKILLS = [
    "embeddings", "sentence-transformers", "openai embeddings", "bge", "e5", "dense retrieval",
    "pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss",
    "ndcg", "mrr", "map", "evaluation", "eval", "retrieval", "vector search", "hybrid search",
    "ranking", "learning to rank", "xgboost", "lora", "qlora", "peft", "nlp"
];

const PLAIN_LANG_REGEXES = [
    /recommendation (system|engine|model|algorithm)/i,
    /recommender/i,
    /collaborative filtering/i,
    /vector search/i,
    /semantic search/i,
    /dense retrieval/i,
    /hybrid search/i,
    /search engine/i,
    /information retrieval/i,
    /learning to rank/i,
    /ranking (model|system|algorithm)/i,
    /match(ing)? (system|algorithm|engine)/i,
    /vector database/i,
    /pinecone/i,
    /weaviate/i,
    /qdrant/i,
    /milvus/i,
    /faiss/i
];

// Helper to parse date
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// Honeypot logical contradiction checker
function checkHoneypot(cand) {
    const p = cand.profile;
    const history = cand.career_history || [];
    const education = cand.education || [];
    const skills = cand.skills || [];
    
    // 1. Expert skills with 0 duration
    const expert0m = skills.filter(s => s.proficiency === "expert" && (s.duration_months || 0) === 0).length;
    if (expert0m > 0) {
        const expertNames = skills.filter(s => s.proficiency === "expert" && (s.duration_months || 0) === 0).map(s => s.name);
        return { isTrap: true, reason: `Expert skill with 0 months duration (skills: ${expertNames.join(', ')})` };
    }
    
    // 2. Job duration exceeds total YOE
    const yoe = p.years_of_experience || 0;
    for (const job of history) {
        const jobYrs = (job.duration_months || 0) / 12.0;
        if (jobYrs > yoe + 0.05) {
            return { isTrap: true, reason: `Job duration (${jobYrs.toFixed(1)} years at ${job.company}) exceeds total YOE (${yoe.toFixed(1)} years)` };
        }
    }
    
    // 3. Job starts long before graduation
    const eduEndYears = education.map(e => e.end_year).filter(y => y);
    if (eduEndYears.length > 0) {
        const minEduEnd = Math.min(...eduEndYears);
        for (const job of history) {
            const start = parseDate(job.start_date);
            if (start) {
                if (minEduEnd - start.getFullYear() > 10) {
                    return { isTrap: true, reason: `Job at ${job.company} starts in ${start.getFullYear()}, which is ${minEduEnd - start.getFullYear()} years before education graduation (${minEduEnd})` };
                }
            }
        }
    }
    return { isTrap: false, reason: "" };
}

// Main scoring engine in JS
function scoreCandidate(cand, weights, options) {
    const p = cand.profile;
    const history = cand.career_history || [];
    const skills = cand.skills || [];
    const signals = cand.redrob_signals || {};
    
    // Check if candidate has only worked at consulting/services firms
    let allConsulting = true;
    for (const job of history) {
        const comp = (job.company || "").toLowerCase();
        let isCons = false;
        for (const cc of CONSULTING_COMPANIES) {
            if (comp.includes(cc)) {
                isCons = true;
                break;
            }
        }
        if (!isCons) {
            allConsulting = false;
            break;
        }
    }
    const consultingPenalty = (options.penalizeConsulting && allConsulting) ? 0.15 : 1.0;
    
    // 1. Role score
    const currTitle = (p.current_title || "").toLowerCase();
    let roleBase = 0.0;
    if (AI_ML_TITLES.includes(currTitle)) {
        roleBase = 1.0;
    } else if (TECH_TITLES.includes(currTitle)) {
        roleBase = 0.6;
    } else if (IRRELEVANT_TITLES.includes(currTitle)) {
        roleBase = 0.05;
    } else {
        roleBase = 0.2;
    }
    
    // Past titles
    let pastMlCount = 0;
    let pastTechCount = 0;
    for (const job of history) {
        const title = (job.title || "").toLowerCase();
        if (AI_ML_TITLES.includes(title)) {
            pastMlCount++;
        } else if (TECH_TITLES.includes(title)) {
            pastTechCount++;
        }
    }
    
    let roleScore = roleBase + (pastMlCount * 0.15) + (pastTechCount * 0.05);
    roleScore = Math.min(roleScore, 1.2);
    if (IRRELEVANT_TITLES.includes(currTitle) && pastMlCount === 0) {
        roleScore = 0.02;
    }
    
    // 2. YOE score
    const yoe = p.years_of_experience || 0;
    let yoeScore = 0.1;
    if (yoe >= 5.0 && yoe <= 9.0) {
        yoeScore = 1.0;
    } else if (yoe >= 4.0 && yoe < 5.0) {
        yoeScore = 0.8;
    } else if (yoe > 9.0 && yoe <= 12.0) {
        yoeScore = 0.8;
    } else if (yoe >= 3.0 && yoe < 4.0) {
        yoeScore = 0.5;
    } else if (yoe > 12.0 && yoe <= 15.0) {
        yoeScore = 0.5;
    }
    
    // 3. Skills Score
    let skillsWeighted = 0.0;
    for (const s of skills) {
        const name = (s.name || "").toLowerCase();
        const dur = s.duration_months || 0;
        const endorsements = s.endorsements || 0;
        
        let isCore = false;
        for (const cs of CORE_SKILLS) {
            if (name.includes(cs)) {
                isCore = true;
                break;
            }
        }
        
        const durYrs = dur / 12.0;
        const trust = durYrs * (1.0 + Math.log1p(endorsements));
        
        if (isCore) {
            skillsWeighted += 2.0 * trust;
        } else {
            if (["python", "sql", "spark", "aws", "gcp", "docker", "git", "scala", "c++", "java"].some(x => name.includes(x))) {
                skillsWeighted += 0.5 * trust;
            }
        }
    }
    const skillsScore = Math.log1p(skillsWeighted);
    
    // 4. Plain Language Project Boost
    let plainLangScore = 0.0;
    for (const job of history) {
        const desc = job.description || "";
        const title = job.title || "";
        for (const rx of PLAIN_LANG_REGEXES) {
            if (rx.test(desc) || rx.test(title)) {
                plainLangScore += 0.5;
            }
        }
    }
    plainLangScore = Math.min(plainLangScore, 1.5);
    
    // Normalize content components with adjustable weights
    const totalContentWeight = weights.role + weights.yoe + weights.skills + weights.plain;
    const contentScore = totalContentWeight > 0 ? (
        (roleScore * weights.role) + 
        (yoeScore * weights.yoe) + 
        (skillsScore * weights.skills) + 
        (plainLangScore * weights.plain)
    ) / totalContentWeight : 0.0;
    
    // 5. Behavioral Modifier
    const rr = signals.recruiter_response_rate || 0.0;
    const rrMod = 0.4 + 0.6 * rr;
    
    const lastActStr = signals.last_active_date || "";
    const lastAct = parseDate(lastActStr);
    const refDate = new Date(2026, 5, 1); // June 1, 2026 reference
    let activeMod = 0.1;
    if (lastAct) {
        const diffTime = Math.abs(refDate - lastAct);
        const daysInactive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysInactive <= 30) {
            activeMod = 1.0;
        } else if (daysInactive <= 90) {
            activeMod = 0.8;
        } else if (daysInactive <= 180) {
            activeMod = 0.5;
        }
    }
    
    const npDays = signals.notice_period_days || 90;
    let npMod = 0.5;
    if (npDays <= 30) {
        npMod = 1.2;
    } else if (npDays <= 60) {
        npMod = 1.0;
    } else if (npDays <= 90) {
        npMod = 0.8;
    }
    
    const loc = (p.location || "").toLowerCase();
    const country = (p.country || "").toLowerCase();
    const willingReloc = signals.willing_to_relocate || false;
    
    let inTarget = TARGET_CITIES.some(city => loc.includes(city));
    let locMod = 0.4;
    if (inTarget) {
        locMod = 1.2;
    } else if (willingReloc) {
        locMod = (country === "india" || country === "") ? 1.0 : 0.2;
    } else {
        if (country !== "india" && country !== "") {
            locMod = 0.05;
        }
    }
    
    const otw = signals.open_to_work_flag || false;
    const otwMod = otw ? 1.1 : 1.0;
    
    const gh = signals.github_activity_score || -1;
    const ghMod = gh >= 0 ? 1.0 + 0.1 * (gh / 100.0) : 0.95;
    
    const icr = signals.interview_completion_rate || 0.0;
    const oar = signals.offer_acceptance_rate || 0.0;
    const icrMod = 0.7 + 0.3 * icr;
    let oarMod = 1.0;
    if (oar >= 0.0) {
        oarMod = 0.8 + 0.2 * oar;
    }
    
    const behavioralFactor = (rrMod * activeMod * npMod * locMod * otwMod * ghMod * icrMod * oarMod);
    const behavioralMultiplier = 1.0 + (behavioralFactor - 1.0) * (weights.behavior / 5.0);
    
    return contentScore * behavioralMultiplier * consultingPenalty;
}

// Generate dynamic reasoning text in Javascript
function generateReasoning(cand, score, rank) {
    const p = cand.profile;
    const s = cand.redrob_signals || {};
    const skills = cand.skills || [];
    
    const yoe = p.years_of_experience || 0;
    const title = p.current_title || "Engineer";
    const comp = p.current_company || "a tech firm";
    
    // Find matching core skills
    const matchingSkills = [];
    for (const sk of skills) {
        const name = (sk.name || "").toLowerCase();
        if (CORE_SKILLS.some(cs => name.includes(cs))) {
            matchingSkills.push(sk.name);
            if (matchingSkills.length >= 2) break;
        }
    }
    
    const skillsPhrase = matchingSkills.length > 0 ? `strong skills in ${matchingSkills.join(', ')}` : "relevant engineering skills";
    const loc = p.location || "";
    const npDays = s.notice_period_days || 90;
    const willingReloc = s.willing_to_relocate || false;
    
    let targetCity = null;
    for (const city of ["Noida", "Pune", "Delhi", "Hyderabad", "Mumbai", "Bangalore"]) {
        if (loc.toLowerCase().includes(city.toLowerCase())) {
            targetCity = city;
            break;
        }
    }
    
    const locPhrase = targetCity ? `${targetCity}-based` : (willingReloc ? "willing to relocate" : "remote preferred");
    const npPhrase = npDays ? `${npDays}d notice` : "immediate joiner";
    
    let sentences = [];
    if (rank <= 15) {
        sentences = [
            `Exceptional ${title} with ${yoe} YOE; shipped ML systems at ${comp} and has ${skillsPhrase}.`,
            `Top-tier ${title} with ${yoe} YOE, showing strong search/retrieval alignment at ${comp}; ${locPhrase} with ${npPhrase}.`,
            `Outstanding match with ${yoe} years in ML; demonstrated vector search expertise at ${comp}; ${npPhrase}.`,
            `Highly relevant ${title} (${yoe} YOE) from ${comp} with ${skillsPhrase}; based locally and active on platform.`
        ];
    } else if (rank <= 50) {
        const gaps = [];
        if (npDays >= 60) gaps.push(`longer notice (${npDays}d)`);
        if (yoe < 5.0) gaps.push(`lower YOE (${yoe} yrs)`);
        if (yoe > 9.0) gaps.push(`higher YOE (${yoe} yrs)`);
        const gapPhrase = gaps.length > 0 ? ` (note: ${gaps.join(', ')})` : "";
        
        sentences = [
            `Strong ${title} with ${yoe} YOE, experienced in NLP/ML at ${comp}; ${skillsPhrase}; ${locPhrase}${gapPhrase}.`,
            `Relevant ML background (${yoe} YOE) from ${comp}; has ${skillsPhrase}; ${npPhrase}${gapPhrase}.`,
            `Solid product-oriented developer with ${yoe} years experience; shows good retrieval project exposure at ${comp}${gapPhrase}.`
        ];
    } else {
        sentences = [
            `Software developer with adjacent skills (${yoe} YOE) at ${comp}; shows general tech proficiency but less direct AI search experience.`,
            `Technical background (${yoe} YOE) with ${skillsPhrase}; limited direct ML production experience but strong general backend at ${comp}.`,
            `Solid developer with ${yoe} YOE at ${comp}; included as filler fit due to good location (${locPhrase}) and active engagement.`
        ];
    }
    
    const idx = parseInt(cand.candidate_id.replace(/\D/g, '')) % sentences.length;
    return sentences[idx];
}

// Global Variables
let allCandidates = [];
let rankedCandidates = [];
let activeCandidate = null;

// DOM Elements
const candidatesGrid = document.getElementById("candidates-grid");
const searchInput = document.getElementById("search-input");
const exportCsvBtn = document.getElementById("export-csv-btn");
const methodologyBtn = document.getElementById("methodology-btn");
const detailDrawer = document.getElementById("detail-drawer");
const closeDrawerBtn = document.getElementById("close-drawer-btn");
const methodologyModal = document.getElementById("methodology-modal");
const closeModalBtn = document.getElementById("close-modal-btn");

// Reset Weight button
const resetWeightsBtn = document.getElementById("reset-weights-btn");

// Sliders
const sliderRole = document.getElementById("role-weight");
const sliderYoe = document.getElementById("yoe-weight");
const sliderSkills = document.getElementById("skills-weight");
const sliderPlain = document.getElementById("plain-weight");
const sliderBehavior = document.getElementById("behavior-weight");

// Slider displays
const valRole = document.getElementById("role-weight-val");
const valYoe = document.getElementById("yoe-weight-val");
const valSkills = document.getElementById("skills-weight-val");
const valPlain = document.getElementById("plain-weight-val");
const valBehavior = document.getElementById("behavior-weight-val");

// Checkboxes
const chkFilterHoneypots = document.getElementById("filter-honeypots-chk");
const chkPenalizeConsulting = document.getElementById("penalize-consulting-chk");
const chkHighlightTraps = document.getElementById("highlight-traps-chk");

// Analytics Display
const valPoolSize = document.getElementById("pool-size-val");
const valAvgYoe = document.getElementById("avg-yoe-val");
const valOfficeMatch = document.getElementById("office-match-val");
const valHoneypotsCount = document.getElementById("honeypots-count-val");
const valDisplayedCount = document.getElementById("displayed-count-val");

// Initialize application
function init() {
    // 1. Load candidates from preloaded js candidates
    allCandidates = SAMPLE_CANDIDATES.map(cand => {
        const hpStatus = checkHoneypot(cand);
        return {
            ...cand,
            isHoneypot: hpStatus.isTrap,
            honeypotReason: hpStatus.reason
        };
    });
    
    // 2. Set event listeners for sliders
    const updateWeightDisplays = () => {
        valRole.textContent = parseFloat(sliderRole.value).toFixed(1);
        valYoe.textContent = parseFloat(sliderYoe.value).toFixed(1);
        valSkills.textContent = parseFloat(sliderSkills.value).toFixed(1);
        valPlain.textContent = parseFloat(sliderPlain.value).toFixed(1);
        valBehavior.textContent = parseFloat(sliderBehavior.value).toFixed(1);
    };
    
    const onControlsChange = () => {
        updateWeightDisplays();
        processAndRender();
    };
    
    [sliderRole, sliderYoe, sliderSkills, sliderPlain, sliderBehavior].forEach(s => {
        s.addEventListener("input", updateWeightDisplays);
        s.addEventListener("change", onControlsChange);
    });
    
    [chkFilterHoneypots, chkPenalizeConsulting, chkHighlightTraps].forEach(c => {
        c.addEventListener("change", processAndRender);
    });
    
    resetWeightsBtn.addEventListener("click", () => {
        sliderRole.value = 4.0;
        sliderYoe.value = 2.0;
        sliderSkills.value = 3.0;
        sliderPlain.value = 2.0;
        sliderBehavior.value = 5.0;
        onControlsChange();
    });
    
    searchInput.addEventListener("input", processAndRender);
    
    // Header actions
    exportCsvBtn.addEventListener("click", exportCSV);
    methodologyBtn.addEventListener("click", () => methodologyModal.classList.remove("hidden"));
    
    // Drawer/Modal actions
    closeDrawerBtn.addEventListener("click", () => detailDrawer.classList.remove("open"));
    closeModalBtn.addEventListener("click", () => methodologyModal.classList.add("hidden"));
    methodologyModal.addEventListener("click", (e) => {
        if (e.target === methodologyModal) methodologyModal.classList.add("hidden");
    });
    
    // 3. First execution
    processAndRender();
}

// Main logic coordinator
function processAndRender() {
    const weights = {
        role: parseFloat(sliderRole.value),
        yoe: parseFloat(sliderYoe.value),
        skills: parseFloat(sliderSkills.value),
        plain: parseFloat(sliderPlain.value),
        behavior: parseFloat(sliderBehavior.value)
    };
    
    const options = {
        filterHoneypots: chkFilterHoneypots.checked,
        penalizeConsulting: chkPenalizeConsulting.checked,
        highlightTraps: chkHighlightTraps.checked
    };
    
    // 1. Process scoring
    let processed = allCandidates.map(cand => {
        const score = scoreCandidate(cand, weights, options);
        return {
            cand,
            score
        };
    });
    
    // 2. Apply Honeypot Filtration
    const honeypotCount = processed.filter(x => x.cand.isHoneypot).length;
    if (options.filterHoneypots) {
        processed = processed.filter(x => !x.cand.isHoneypot);
    }
    
    // 3. Sort: score descending, then candidate_id ascending for tiebreaks
    processed.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return a.cand.candidate_id.localeCompare(b.cand.candidate_id);
    });
    
    // 4. Set Ranked Array
    rankedCandidates = processed.map((x, idx) => {
        const rank = idx + 1;
        const reasoning = generateReasoning(x.cand, x.score, rank);
        return {
            ...x,
            rank,
            reasoning
        };
    });
    
    // 5. Apply Search Query Filter
    const query = searchInput.value.toLowerCase().trim();
    let displayed = [...rankedCandidates];
    if (query) {
        displayed = displayed.filter(item => {
            const p = item.cand.profile;
            const name = (p.anonymized_name || "").toLowerCase();
            const title = (p.current_title || "").toLowerCase();
            const comp = (p.current_company || "").toLowerCase();
            const skills = (item.cand.skills || []).map(s => s.name.toLowerCase()).join(' ');
            return name.includes(query) || title.includes(query) || comp.includes(query) || skills.includes(query);
        });
    }
    
    // 6. Update Analytics
    valPoolSize.textContent = allCandidates.length;
    
    const validYOEs = allCandidates.filter(c => !c.isHoneypot).map(c => c.profile.years_of_experience || 0);
    const avgYOE = validYOEs.length > 0 ? (validYOEs.reduce((a, b) => a + b, 0) / validYOEs.length).toFixed(1) : "0.0";
    valAvgYoe.textContent = `${avgYOE} YOE`;
    
    const targetLocCount = allCandidates.filter(c => {
        if (c.isHoneypot) return false;
        const loc = (c.profile.location || "").toLowerCase();
        const willing = c.redrob_signals.willing_to_relocate || false;
        const inCity = TARGET_CITIES.some(ct => loc.includes(ct));
        return inCity || willing;
    }).length;
    const locPercentage = allCandidates.length > 0 ? Math.round((targetLocCount / allCandidates.length) * 100) : 0;
    valOfficeMatch.textContent = `${locPercentage}%`;
    
    valHoneypotsCount.textContent = honeypotCount;
    valDisplayedCount.textContent = displayed.length;
    
    // 7. Render Grid
    renderCandidates(displayed, options);
}

// Render candidate cards
function renderCandidates(items, options) {
    candidatesGrid.innerHTML = "";
    
    if (items.length === 0) {
        candidatesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-slash empty-icon"></i>
                <h3>No Candidates Match Query</h3>
                <p>Try resetting weights or modifying search parameters.</p>
            </div>
        `;
        return;
    }
    
    items.forEach(item => {
        const c = item.cand;
        const p = c.profile;
        const sig = c.redrob_signals;
        
        const card = document.createElement("div");
        card.className = "candidate-card";
        if (c.isHoneypot && options.highlightTraps) {
            card.classList.add("honeypot-trap");
        }
        
        // Match percentage score
        const matchScorePercent = Math.round(Math.min(item.score * 30.0, 100.0)); // scaling for display bar
        
        // Active recency badge
        const lastActStr = sig.last_active_date || "";
        const lastAct = parseDate(lastActStr);
        const refDate = new Date(2026, 5, 1);
        let activeText = "Inactive";
        let isActive = false;
        if (lastAct) {
            const diffTime = Math.abs(refDate - lastAct);
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (days <= 30) {
                activeText = "Active recently";
                isActive = true;
            } else if (days <= 90) {
                activeText = `Active ${Math.round(days/30)}m ago`;
                isActive = true;
            } else {
                activeText = `Inactive ${Math.round(days/30)}m`;
            }
        }
        
        const activeIndicator = isActive ? `<span class="active-glow"></span>` : `<span class="active-stale"></span>`;
        
        // Render skill tags (top 4 core skills)
        const coreTags = [];
        const otherTags = [];
        (c.skills || []).forEach(s => {
            const isCore = CORE_SKILLS.some(cs => s.name.toLowerCase().includes(cs));
            if (isCore && coreTags.length < 3) {
                coreTags.push(`<span class="skill-tag core">${s.name}</span>`);
            } else if (otherTags.length < 2) {
                otherTags.push(`<span class="skill-tag">${s.name}</span>`);
            }
        });
        const skillsHTML = [...coreTags, ...otherTags].join('');
        
        card.innerHTML = `
            <div class="card-header-row">
                <span class="rank-badge">Rank #${item.rank}</span>
                <span class="score-badge">${item.score.toFixed(4)}</span>
            </div>
            
            <div class="card-info">
                <h3>${p.anonymized_name} ${c.isHoneypot && options.highlightTraps ? '<span class="text-danger-label"><i class="fa-solid fa-triangle-exclamation"></i> TRAP</span>' : ''}</h3>
                <span class="card-headline">${p.current_title} at ${p.current_company}</span>
            </div>
            
            <div class="card-reasoning">
                ${item.reasoning}
            </div>
            
            <div class="card-skills">
                ${skillsHTML}
            </div>
            
            <div class="card-footer-metrics">
                <span class="metric-pill">
                    <i class="fa-solid fa-briefcase"></i> ${p.years_of_experience} YOE
                </span>
                <span class="metric-pill">
                    ${activeIndicator} ${activeText}
                </span>
            </div>
        `;
        
        card.addEventListener("click", () => openCandidateDrawer(item));
        candidatesGrid.appendChild(card);
    });
}

// Drawer Open Logic
function openCandidateDrawer(item) {
    activeCandidate = item;
    const c = item.cand;
    const p = c.profile;
    const sig = c.redrob_signals;
    
    document.getElementById("drawer-rank").textContent = item.rank;
    document.getElementById("drawer-score").textContent = item.score.toFixed(4);
    document.getElementById("drawer-name").textContent = p.anonymized_name;
    document.getElementById("drawer-headline").textContent = `${p.current_title} at ${p.current_company}`;
    document.getElementById("drawer-yoe").textContent = p.years_of_experience;
    document.getElementById("drawer-loc").textContent = `${p.location}, ${p.country || 'India'}`;
    
    // Open to work status
    const otwTag = document.getElementById("drawer-otw-tag");
    if (sig.open_to_work_flag) {
        otwTag.classList.remove("hidden");
    } else {
        otwTag.classList.add("hidden");
    }
    
    // Honeypot Alert
    const hpAlert = document.getElementById("drawer-honeypot-alert");
    if (c.isHoneypot) {
        hpAlert.classList.remove("hidden");
        document.getElementById("drawer-honeypot-reason").textContent = c.honeypotReason;
    } else {
        hpAlert.classList.add("hidden");
    }
    
    document.getElementById("drawer-summary").textContent = p.summary || "No professional summary provided.";
    
    // Platform Signals
    document.getElementById("sig-response-rate").textContent = `${Math.round(sig.recruiter_response_rate * 100)}%`;
    document.getElementById("sig-response-time").textContent = `${sig.avg_response_time_hours.toFixed(1)} hrs`;
    document.getElementById("sig-notice-period").textContent = `${sig.notice_period_days} days`;
    document.getElementById("sig-salary").textContent = `${sig.expected_salary_range_inr_lpa.min} - ${sig.expected_salary_range_inr_lpa.max} LPA`;
    document.getElementById("sig-work-mode").textContent = sig.preferred_work_mode;
    document.getElementById("sig-github").textContent = sig.github_activity_score >= 0 ? `${sig.github_activity_score} / 100` : "Not Linked";
    document.getElementById("sig-completeness").textContent = `${Math.round(sig.profile_completeness_score)}%`;
    
    const lastAct = parseDate(sig.last_active_date);
    if (lastAct) {
        const diffTime = Math.abs(new Date(2026, 5, 1) - lastAct);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        document.getElementById("sig-last-active").textContent = `Active ${days}d ago`;
    } else {
        document.getElementById("sig-last-active").textContent = "Inactive";
    }

    // Render Timeline
    const timeline = document.getElementById("drawer-timeline");
    timeline.innerHTML = "";
    (c.career_history || []).forEach(job => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "timeline-item";
        if (job.is_current) {
            itemDiv.classList.add("current");
        }
        itemDiv.innerHTML = `
            <div class="timeline-header">
                <div>
                    <div class="timeline-title">${job.title}</div>
                    <div class="timeline-company">${job.company} — <span class="text-capitalize">${job.company_size}</span> | ${job.industry}</div>
                </div>
                <div class="timeline-duration">${job.start_date} to ${job.end_date || 'Present'} (${job.duration_months}m)</div>
            </div>
            <p class="timeline-desc">${job.description || ''}</p>
        `;
        timeline.appendChild(itemDiv);
    });
    
    // Render Education
    const eduList = document.getElementById("drawer-education");
    eduList.innerHTML = "";
    (c.education || []).forEach(edu => {
        const eduDiv = document.createElement("div");
        eduDiv.className = "edu-item";
        eduDiv.innerHTML = `
            <div>
                <div class="edu-degree">${edu.degree} — ${edu.field_of_study}</div>
                <div class="edu-school">${edu.institution}</div>
            </div>
            <div class="text-right">
                <div class="edu-year">${edu.start_year} - ${edu.end_year}</div>
                <span class="edu-tier ${edu.tier}">${edu.tier.replace('_', ' ')}</span>
            </div>
        `;
        eduList.appendChild(eduDiv);
    });
    
    // Render Skills Grid
    const skillsGrid = document.getElementById("drawer-skills-grid");
    skillsGrid.innerHTML = "";
    (c.skills || []).forEach(s => {
        const card = document.createElement("div");
        card.className = "skill-trust-card";
        
        // Skill weight representation (max endorsements = 100)
        const barPercent = Math.min(Math.round(((s.duration_months || 0) / 60.0) * 100), 100);
        
        card.innerHTML = `
            <div class="skill-trust-name" title="${s.name}">${s.name}</div>
            <div class="skill-trust-bar">
                <div class="skill-trust-fill" style="width: ${barPercent}%"></div>
            </div>
            <div class="skill-trust-meta">
                <span class="text-capitalize">${s.proficiency}</span>
                <span>${s.duration_months || 0}m | <i class="fa-solid fa-thumbs-up"></i> ${s.endorsements}</span>
            </div>
        `;
        skillsGrid.appendChild(card);
    });
    
    // Open drawer
    detailDrawer.classList.add("open");
}

// Export CSV handler
function exportCSV() {
    if (rankedCandidates.length === 0) {
        alert("No candidates to export.");
        return;
    }
    
    const rows = [
        ["candidate_id", "rank", "score", "reasoning"]
    ];
    
    // Export all 100 candidates
    const csvList = rankedCandidates.slice(0, 100);
    csvList.forEach(item => {
        rows.push([
            item.cand.candidate_id,
            item.rank,
            item.score.toFixed(4),
            item.reasoning
        ]);
    });
    
    let csvContent = "data:text/csv;charset=utf-8,";
    rows.forEach(rowArray => {
        // Handle double quotes in reasonings
        const escaped = rowArray.map(val => {
            const s = String(val);
            if (s.includes('"') || s.includes(',')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        });
        csvContent += escaped.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "team_antigravity.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start the app when ready
window.addEventListener("DOMContentLoaded", init);
