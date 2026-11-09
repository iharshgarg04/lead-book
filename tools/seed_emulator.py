"""Load backup/leads-backup.json plus example invoice settings into the local Firestore emulator.

Usage: start emulators (`firebase emulators:start --config firebase.emulator.json --project khushi-lead-book`),
then run `python3 tools/seed_emulator.py`. Never touches the live database."""
import json, os, urllib.request

BASE = "http://127.0.0.1:8080/v1/projects/khushi-lead-book/databases/(default)/documents"
P = "projects/khushi-lead-book/databases/(default)/documents"

def val(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [val(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: val(x) for k, x in v.items()}}}
    raise TypeError(type(v))

def commit(writes):
    for i in range(0, len(writes), 400):
        req = urllib.request.Request(BASE + ":commit", data=json.dumps({"writes": writes[i:i + 400]}).encode(), method="POST",
                                     headers={"Authorization": "Bearer owner", "Content-Type": "application/json"})
        urllib.request.urlopen(req).read()

root = os.path.join(os.path.dirname(__file__), "..", "backup", "leads-backup.json")
b = json.load(open(root))
writes = [{"update": {"name": f"{P}/months/{m['id']}", "fields": {k: val(x) for k, x in m["data"].items()}}} for m in b["months"]]
writes += [{"update": {"name": f"{P}/months/{l['month']}/leads/{l['id']}", "fields": {k: val(x) for k, x in l["data"].items()}}} for l in b["leads"]]
example = {"legalName": "EXAMPLE STUDIOS", "gstin": "00AAAAA0000A0ZZ", "address": "1 Example Street, Example City 000000",
           "pan": "AAAAA0000A", "terms": "Account Number : 000000000000\nIfsc Code : TEST0000000", "prefix": ""}
settings = {"taxRate": 18, "logo": "", "profiles": {"gst": example, "nongst": dict(example, gstin="", prefix="NG-")}}
writes.append({"update": {"name": f"{P}/settings/business", "fields": {k: val(x) for k, x in settings.items()}}})
writes.append({"update": {"name": f"{P}/settings/counters", "fields": {"gst": val(301), "nongst": val(1)}}})
commit(writes)
print(f"Seeded {len(b['months'])} months, {len(b['leads'])} leads and example settings into the emulator.")
