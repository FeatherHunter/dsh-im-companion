from PIL import Image, ImageDraw, ImageFont
import os
font_path = 'C:/Windows/Fonts/msyh.ttc'
# try sizes
for sz in [14,15,16,17,18,19,20]:
    f = ImageFont.truetype(font_path, sz)
    # measure
    im = Image.new('RGB',(100,40),(249,250,251))
    d = ImageDraw.Draw(im)
    bbox = d.textbbox((0,0), '待认领无助理有', font=f)
    print(f'size {sz} bbox {bbox} h={bbox[3]-bbox[1]} w_total={bbox[2]-bbox[0]}')
    # per char
    for ch in ['待','认','领','无','助','理','有']:
        bb = d.textbbox((0,0), ch, font=f)
        print(f'  {ch} {bb} w={bb[2]-bb[0]} h={bb[3]-bb[1]}')
    print()
