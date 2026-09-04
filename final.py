from PIL import Image, ImageDraw, ImageFont
src = 'D:/dsh-plugin/dsh-im-companion/image-edit.png'
text_color = (97,102,107)
bg = (249,250,251)
font_path_bold = 'C:/Windows/Fonts/msyhbd.ttc'
# measure bold16 char widths
f16b = ImageFont.truetype(font_path_bold, 16)
tmp = Image.new('RGB',(100,40),bg)
d = ImageDraw.Draw(tmp)
for ch in ['无','助','理']:
    bb = d.textbbox((0,0), ch, font=f16b, anchor='lt')
    print(ch, bb, 'w', bb[2]-bb[0])
# try final: individual positions
tests = [
    ('final-A', 16, 32, [282,301,318]),
    ('final-B', 16, 32, [282,300,318]),
    ('final-C', 16, 31, [282,300,318]),
]
for name, sz, y, xs in tests:
    im = Image.open(src).convert('RGBA')
    f = ImageFont.truetype(font_path_bold, sz)
    draw = ImageDraw.Draw(im)
    draw.rectangle([280,26,343,54], fill=bg+(255,))
    chars = ['无','助','理']
    for ch, x in zip(chars, xs):
        draw.text((x, y), ch, font=f, fill=text_color+(255,), anchor='lt')
    out = f'D:/dsh-plugin/dsh-im-companion/{name}.png'
    im.save(out)
    print(f'saved {out}')
    crop = im.crop((130,0,378,63))
    big = crop.resize((crop.width*3, crop.height*3), Image.NEAREST)
    big.save(f'D:/dsh-plugin/dsh-im-companion/{name}-zoom.png')
