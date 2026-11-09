import csv, json, re, os, collections
D = os.path.dirname(os.path.abspath(__file__))
TABS = [("tab_Sept.csv", "2026-09", "Sept"), ("tab_October.csv", "2026-10", "October"), ("tab_Nov.csv", "2026-11", "Nov")]
TODAY = "2026-11-06"

EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE = re.compile(r"^(p:\s*)?\+?\d[\d\s\-]{8,}$")

def norm_pkg(s):
    s = s.lower()
    for k in ("launch", "advance", "growth", "scaling"):
        if k in s: return k
    return ""

def norm_tl(s):
    s = s.lower()
    if s.startswith("immediately"): return "now"
    if s.startswith("in_2"): return "2-3w"
    if s.startswith("in_1_month"): return "1m"
    if s.startswith("flexible"): return "flexible"
    return ""

def norm_phone(s):
    d = re.sub(r"\D", "", s or "")
    if not d: return ""
    if len(d) == 10: d = "91" + d
    return "+" + d

NA = re.compile(r"^np$|^n\.p$|not\s*pick|not received|no\s+incoming|switched off|not reachable|nhi pick|texted on whatsapp")
RULES = [
    ("junk", re.compile(r"wrong number|^waste$|^creator$|^fukra$")),
    ("lost", re.compile(r"dropped the plan|ghosted|not responding|kinda over|budget nhi|budget issue|very low budget for|khi or se|kuch bhi ready nhi|summers only")),
    ("meeting_done", re.compile(r"mee+ting done")),
    ("meeting_set", re.compile(r"mee?t(ing|inf)? set|meeting tom")),
    ("portfolio", re.compile(r"portfolio|porrfolio|refrence|reference|sent all the details|mailed|send the details|shared our")),
    ("callback", re.compile(r"call (him|her)|call back|callback|will call|after diwali|align a (call|meeting)|busy|occupied|\btmm\b|tom+or+ow|sometime|out of station|after lunch|get back|on (mon|tues|wednes|thurs|fri|satur|sun)day|after 1nov")),
    ("no_answer", NA),
]

def infer(notes):
    if not notes: return "new", 0
    attempts = sum(1 for n in notes if NA.search(n.lower()))
    last = notes[-1].lower().strip()
    for status, rx in RULES:
        if rx.search(last): return status, attempts
    return "talking", attempts

def is_header(cells):
    low = [c.lower() for c in cells]
    return "email" in low or "first_name" in low or "phone_number" in low

def parse_tab(path):
    rows = list(csv.reader(open(path, encoding="utf-8")))
    email_col = 2
    out = []
    for i, raw in enumerate(rows):
        cells = [c.strip() for c in raw]
        if not any(cells): continue
        if is_header(cells):
            low = [c.lower() for c in cells]
            if "email" in low: email_col = low.index("email")
            continue
        pkg_i = next((j for j, c in enumerate(cells) if "package" in c.lower()), None)
        tl_i = next((j for j, c in enumerate(cells) if norm_tl(c)), None)
        em_i = next((j for j, c in enumerate(cells) if EMAIL.match(c)), None)
        anchor = em_i if em_i is not None else (max(x for x in (pkg_i, tl_i) if x is not None) + 1 if (pkg_i is not None or tl_i is not None) else email_col)
        ph_i = next((j for j in range(anchor + 1, len(cells)) if PHONE.match(cells[j])), None)
        if ph_i is None: ph_i = anchor + 2
        name = " ".join(c for c in cells[anchor + 1:ph_i] if c).strip()
        phone = norm_phone(cells[ph_i]) if ph_i < len(cells) else ""
        if not phone and anchor < len(cells) and PHONE.match(cells[anchor]): phone = norm_phone(cells[anchor])
        company = cells[ph_i + 1] if ph_i + 1 < len(cells) else ""
        notes = [c for c in cells[ph_i + 2:] if c]
        email = cells[em_i] if em_i is not None else ""
        if not (phone or email): continue
        out.append(dict(row=i + 1, name=name, phone=phone, email=email, company=company,
                        package=norm_pkg(cells[pkg_i]) if pkg_i is not None else "",
                        timeline=norm_tl(cells[tl_i]) if tl_i is not None else "", notes=notes))
    return out

def lead_id(r):
    if r["phone"]: return "p" + r["phone"].lstrip("+")
    return "e" + re.sub(r"[^A-Za-z0-9_\-.~:@+]", "", r["email"].lower())[:180]

merged = collections.OrderedDict()   # id -> (monthKey, doc)
for fname, mkey, label in TABS:
    for r in parse_tab(os.path.join(D, fname)):
        lid = lead_id(r)
        sheet_notes = [{"kind": "sheet", "t": n, "at": None, "by": None, "src": label} for n in r["notes"]]
        if lid in merged:
            pm, doc = merged.pop(lid)
            doc["notes"] += [{"kind": "status", "t": f"Filled the form again ({label} tab)", "at": None, "by": None, "src": label}] + sheet_notes
            doc["enquiries"] += 1
            for k in ("name", "company", "email", "package", "timeline"):
                if r[k]: doc[k] = r[k]
            doc["seq"] = r["row"]; doc["tab"] = label; doc["sheetRow"] = r["row"]
            merged[lid] = (mkey, doc)
            continue
        merged[lid] = (mkey, {"name": r["name"], "company": r["company"], "email": r["email"], "phone": r["phone"],
            "package": r["package"], "timeline": r["timeline"], "notes": sheet_notes, "enquiries": 1,
            "tab": label, "sheetRow": r["row"], "seq": r["row"], "createdAt": None, "updatedAt": None,
            "updatedBy": None, "lastCallAt": None})

counts = collections.Counter(); by_month = collections.Counter()
for lid, (mkey, doc) in merged.items():
    texts = [n["t"] for n in doc["notes"] if n["kind"] == "sheet"]
    status, attempts = infer(texts)
    doc["status"] = status; doc["attempts"] = attempts
    doc["nextAt"] = TODAY if status == "callback" else None
    counts[status] += 1; by_month[mkey] += 1
    d = os.path.join(D, "out", mkey); os.makedirs(d, exist_ok=True)
    json.dump(doc, open(os.path.join(d, lid + ".json"), "w"), ensure_ascii=False)

print("total", len(merged), dict(by_month)); print(dict(counts))
