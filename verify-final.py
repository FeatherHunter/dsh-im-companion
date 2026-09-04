from PIL import Image
import numpy as np, shutil
# copy final-A as the deliverable
shutil.copy('D:/dsh-plugin/dsh-im-companion/final-A.png', 'D:/dsh-plugin/dsh-im-companion/edited-result.png')
im = Image.open('D:/dsh-plugin/dsh-im-companion/final-A.png').convert('RGB')
arr = np.array(im)
dark=(arr.mean(axis=2)<120)
ys,xs=np.where(dark)
for x0,x1,label in [(0,130,'tab1'),(130,250,'tab2'),(250,343,'tab3-new')]:
    m=(xs>=x0)&(xs<x1)
    print(label,'x',int(xs[m].min()),int(xs[m].max()),'y',int(ys[m].min()),int(ys[m].max()))
print('done')
