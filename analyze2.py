from PIL import Image
import numpy as np
im = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png').convert('RGB')
arr = np.array(im)
dark = (arr.mean(axis=2) < 120)
# tab3 region x 275-340, look at column sums
for x in range(275, 345):
    col = dark[20:55, x].sum()
    print(f'{x}:{col}', end=' ')
    if (x-275)%10==9:
        print()
print()
# also dump y projection for tab3
print('--- y projection tab3 x282-333')
for y in range(20,56):
    row = dark[y, 282:334].sum()
    print(f'{y}:{row}', end=' ')
    if (y-20)%9==8:
        print()
