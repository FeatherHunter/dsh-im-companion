from PIL import Image
import numpy as np
im = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png').convert('RGB')
arr = np.array(im)
# light threshold for digits: mean < 180 to catch light gray digits
for thr in [120, 180]:
    dark = (arr.mean(axis=2) < thr)
    ys, xs = np.where(dark[:, 250:378])
    xs = xs + 250
    print(f'thr {thr} tab3-right bbox x', int(xs.min()), int(xs.max()), 'y', int(ys.min()), int(ys.max()))
# column projection with thr 180 for x 280-378
print('col proj thr180 x280-378')
dark180 = (arr.mean(axis=2) < 180)
for x in range(280, 378):
    c = int(dark180[20:55, x].sum())
    print(f'{x}:{c}', end=' ')
    if (x-280)%10==9:
        print()
print()
# sample colors: dark text pixels tab3
mask_dark = (arr.mean(axis=2) < 120)
# tab3 chinese region
ys3, xs3 = np.where(mask_dark)
# filter tab3 chinese
sel = (xs3>=282)&(xs3<=333)&(ys3>=32)&(ys3<=48)
px = arr[ys3[sel], xs3[sel]]
print('dark text median', np.median(px, axis=0), 'mean', px.mean(axis=0).round(1))
# digit pixels: thr180 but not thr120, in tab3 right
mask_light = ((arr.mean(axis=2) < 200) & (arr.mean(axis=2) >= 120))
# find digit region x>334
ysL, xsL = np.where(mask_light)
selL = (xsL>334)&(xsL<378)&(ysL>=20)&(ysL<=55)
if selL.sum()>0:
    print('light digit bbox x', int(xsL[selL].min()), int(xsL[selL].max()), 'y', int(ysL[selL].min()), int(ysL[selL].max()))
    pxL = arr[ysL[selL], xsL[selL]]
    print('light digit median', np.median(pxL, axis=0))
# bg sample: patch without text, e.g., x240 y31
print('bg samples:', arr[31,240].tolist(), arr[40,270].tolist(), arr[40,340].tolist() if 340<378 else 'na')
# tab2 column projection thr120
print('tab2 col proj thr120 x150-220')
dark120 = (arr.mean(axis=2) < 120)
for x in range(150, 225):
    c = int(dark120[20:55, x].sum())
    print(f'{x}:{c}', end=' ')
    if (x-150)%10==9:
        print()
print()
# save individual char crops zoomed
for name, x0,x1 in [('tab2-you',160,178),('tab2-zhu',180,196),('tab2-li',198,212),('tab3-dai',282,298),('tab3-ren',300,316),('tab3-ling',318,334)]:
    c = im.crop((x0, 28, x1, 52))
    cbig = c.resize((c.width*8, c.height*8), Image.NEAREST)
    cbig.save(f'D:/dsh-plugin/dsh-im-companion/char-{name}.png')
    print(f'saved {name} size {c.size}')
