from PIL import Image
import numpy as np
im = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png').convert('RGB')
arr = np.array(im)
# darkest pixels in tab3
for x0,x1,label in [(282,297,'dai'),(301,315,'ren'),(318,333,'ling'),(160,174,'you'),(178,192,'zhu'),(196,211,'li')]:
    patch = arr[32:49, x0:x1+1]
    # flatten, sort by brightness
    bright = patch.mean(axis=2).flatten()
    idx = np.argsort(bright)
    darkest = patch.reshape(-1,3)[idx[:5]]
    print(label, 'darkest', darkest.tolist(), 'median-dark', np.median(patch.reshape(-1,3)[bright.flatten()<120], axis=0) if (bright<120).sum()>0 else 'none')
