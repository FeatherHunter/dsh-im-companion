import subprocess, hashlib

def run(args, **kw):
    return subprocess.run(args, capture_output=True, check=True, **kw).stdout

base = run(['git', 'rev-parse', '779a932']).strip()
entries = run(['git', 'ls-tree', base.decode('ascii')]).split(b'\n')
key = b'\tprototype-c1a-drawer.html'
idx = next(i for i, l in enumerate(entries) if l.endswith(key))
keep = [l for l in entries if l and not l.endswith(key)]
v2blob = run(['git', 'rev-parse', 'cb8c206:prototype-c1a-drawer.html']).strip()
data = open('prototype-c1a-drawer.html', 'rb').read()
digest = hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest().encode('ascii')
assert digest == v2blob, (digest, v2blob)
keep.insert(idx, b'100644 blob ' + v2blob + key)
newtree = subprocess.run(['git', 'mktree'], input=b'\n'.join(keep) + b'\n', capture_output=True, check=True).stdout.strip()
newcommit = subprocess.run(
    ['git', 'commit-tree', newtree.decode('ascii'), '-p', base.decode('ascii'), '-F', '.scratch/v2msg.txt'],
    capture_output=True, check=True).stdout.strip()
print(newcommit.decode('ascii'))
