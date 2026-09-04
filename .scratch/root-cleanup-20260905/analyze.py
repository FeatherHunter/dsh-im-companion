from PIL import Image
im = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png').convert('RGB')
w,h = im.size
print(w,h)
crop = im.crop((230, 0, 378, 63))
crop_big = crop.resize((crop.width*4, crop.height*4), Image.NEAREST)
crop_big.save('D:/dsh-plugin/dsh-im-companion/crop-zoom.png')
print('saved crop-zoom')
big = im.resize((w*4, h*4), Image.NEAREST)
big.save('D:/dsh-plugin/dsh-im-companion/full-zoom.png')
print('saved full-zoom')
import numpy as np
arr = np.array(im)
dark = (arr.mean(axis=2) < 120)
ys, xs = np.where(dark)
print('dark bbox overall x:', int(xs.min()), int(xs.max()), 'y:', int(ys.min()), int(ys.max()))
for x0,x1,label in [(0,130,'tab1'),(130,250,'tab2'),(250,378,'tab3')]:
    m = (xs>=x0)&(xs<x1)
    if m.sum()>0:
        print(label, 'x', int(xs[m].min()), int(xs[m].max()), 'y', int(ys[m].min()), int(ys[m].max()), 'count', int(m.sum()))
