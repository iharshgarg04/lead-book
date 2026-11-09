"""Bundle backup/months/** (exported from the Claude artifact) into one restore file."""
import json, glob, os, datetime
root = os.path.join(os.path.dirname(__file__), '..', 'backup')
out = {'format': 'leadbook-backup', 'version': 1, 'exportedAt': datetime.datetime.utcnow().isoformat() + 'Z', 'months': [], 'leads': []}
for f in sorted(glob.glob(os.path.join(root, 'months', '*.json'))):
    out['months'].append({'id': os.path.basename(f)[:-5], 'data': json.load(open(f))})
for f in sorted(glob.glob(os.path.join(root, 'months', '*', 'leads', '*.json'))):
    month = f.split(os.sep)[-3]
    out['leads'].append({'month': month, 'id': os.path.basename(f)[:-5], 'data': json.load(open(f))})
dest = os.path.join(root, 'leads-backup.json')
json.dump(out, open(dest, 'w'), ensure_ascii=False)
print(len(out['months']), 'months,', len(out['leads']), 'leads ->', os.path.relpath(dest))
