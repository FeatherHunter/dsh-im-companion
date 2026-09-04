from PIL import Image
import numpy as np
import glob
for path in sorted(glob.glob('D:/dsh-plugin/dsh-im-companion/v-*.png')):
    if 'zoom' in path:
        continue
    im = Image.open(path).convert('RGB')
    arr = np.array(im)
    dark = (arr.mean(axis=2) < 120)
    ys, xs = np.where(dark)
    # filter x 250-340 (tab3 chinese)
    m = (xs>=250)&(xs<343)
    print(path.split('/')[-1], 'tab3 x', int(xs[m].min()), int(xs[m].max()), 'y', int(ys[m].min()), int(ys[m].max()), 'w', int(xs[m].max()-xs[m].min()+1))
# original
im0 = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png').convert('RGB')
arr0 = np.array(im0)
dark0=(arr0.mean(axis=2)<120)
ys0,xs0=np.where(dark0)
m0=(xs0>=250)&(xs0<343)
print('original', 'tab3 x', int(xs0[m0].min()), int(xs0[m0].max()), 'y', int(ys0[m0].min()), int(ys0[m0].max()))
m1=(xs0>=130)&(xs0<230)
print('original tab2 x', int(xs0[m1].min()), int(xs0[m1].max()), 'y', int(ys0[m1].min()), int(ys0[m1].max()))
