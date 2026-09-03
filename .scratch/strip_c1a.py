import sys
root = sys.argv[1]
p = root + '\\src\\features\\index.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("\nimport { feature as c1aDrawer } from './c1a/manifest'", '')
s = s.replace('[c1aDrawer, leftBadges]', '[leftBadges]')
open(p, 'w', encoding='utf-8').write(s)
q = root + '\\package.json'
t = open(q, encoding='utf-8').read()
t = t.replace(' && node --test tools/verify/features/c1a-drawer.ts', '')
open(q, 'w', encoding='utf-8').write(t)
print('stripped ok')
