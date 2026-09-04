from PIL import Image, ImageDraw, ImageFont
src = 'D:/dsh-plugin/dsh-im-companion/image-edit.png'
font_path = 'C:/Windows/Fonts/msyh.ttc'
text_color = (97,102,107)
bg = (249,250,251)
for sz in [15,16,17]:
    for y_try in [28,29,30,31]:
        im = Image.open(src).convert('RGBA')
        f = ImageFont.truetype(font_path, sz)
        # erase rect covering old chinese only: x280-342, y26-54
        draw = ImageDraw.Draw(im)
        draw.rectangle([280,26,342,54], fill=bg+(255,))
        # draw new text
        draw.text((282, y_try), '无助理', font=f, fill=text_color+(255,), anchor='lt')
        out = f'D:/dsh-plugin/dsh-im-companion/draft-sz{sz}-y{y_try}.png'
        im.save(out)
        print(f'saved {out}')
