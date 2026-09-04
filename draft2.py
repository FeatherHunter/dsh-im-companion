from PIL import Image, ImageDraw, ImageFont
src = 'D:/dsh-plugin/dsh-im-companion/image-edit.png'
text_color = (97,102,107)
bg = (249,250,251)
variants = [
    ('reg16', 'C:/Windows/Fonts/msyh.ttc', 16, 282, 30, 0),
    ('reg17', 'C:/Windows/Fonts/msyh.ttc', 17, 282, 30, 0),
    ('bold15', 'C:/Windows/Fonts/msyhbd.ttc', 15, 282, 30, 0),
    ('bold16', 'C:/Windows/Fonts/msyhbd.ttc', 16, 282, 30, 0),
    ('bold15b', 'C:/Windows/Fonts/msyhbd.ttc', 15, 282, 29, 0),
    ('reg16-sw', 'C:/Windows/Fonts/msyh.ttc', 16, 282, 30, 1),
]
for name, fp, sz, x, y, sw in variants:
    im = Image.open(src).convert('RGBA')
    f = ImageFont.truetype(fp, sz)
    draw = ImageDraw.Draw(im)
    draw.rectangle([280,26,342,54], fill=bg+(255,))
    if sw:
        draw.text((x, y), '无助理', font=f, fill=text_color+(255,), anchor='lt', stroke_width=sw, stroke_fill=text_color+(255,))
    else:
        draw.text((x, y), '无助理', font=f, fill=text_color+(255,), anchor='lt')
    out = f'D:/dsh-plugin/dsh-im-companion/v-{name}.png'
    im.save(out)
    print(f'saved {out}')
    # zoom crop
    crop = im.crop((130,0,378,63))
    big = crop.resize((crop.width*3, crop.height*3), Image.NEAREST)
    big.save(f'D:/dsh-plugin/dsh-im-companion/v-{name}-zoom.png')
    print(f'saved zoom {name}')
