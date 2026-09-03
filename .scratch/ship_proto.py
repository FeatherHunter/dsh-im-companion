import subprocess, sys, hashlib
base_ref, path, msgfile = sys.argv[1], sys.argv[2], sys.argv[3]

def run(args, **kw):
    return subprocess.run(args, capture_output=True, check=True, **kw).stdout

base = run(['git', 'rev-parse', base_ref.encode('ascii')]).strip()
entries = run(['git', 'ls-tree', base]).split(b'\n')
key = b'\t' + path.encode('utf-8')
idx = next(i for i, l in enumerate(entries) if l.endswith(key))
keep = [l for l in entries if l and not l.endswith(key)]
blob = run(['git', 'hash-object', '-w', path.encode('utf-8')]).strip()
data = open(path, 'rb').read()
assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest().encode('ascii') == blob, 'hash mismatch'
keep.insert(idx, b'100644 blob ' + blob + key)
newtree = subprocess.run(['git', 'mktree'], input=b'\n'.join(keep) + b'\n', capture_output=True, check=True).stdout.strip()
newcommit = subprocess.run(
    ['git', 'commit-tree', newtree.decode('ascii'), '-p', base.decode('ascii'), '-F', msgfile],
    capture_output=True, check=True).stdout.strip()
print(newcommit.decode('ascii'))
