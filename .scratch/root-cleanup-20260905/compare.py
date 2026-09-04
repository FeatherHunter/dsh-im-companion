from PIL import Image
for name in ['draft-sz16-y30','draft-sz16-y29','draft-sz17-y30','draft-sz15-y30']:
    im = Image.open(f'D:/dsh-plugin/dsh-im-companion/{name}.png')
    crop = im.crop((250, 0, 378, 63))
    big = crop.resize((crop.width*4, crop.height*4), Image.NEAREST)
    big.save(f'D:/dsh-plugin/dsh-im-companion/{name}-zoom.png')
    print(f'saved {name}-zoom')
    # also tab2 crop for reference from original
orig = Image.open('D:/dsh-plugin/dsh-im-companion/image-edit.png')
ref = orig.crop((130,0,250,63))
refbig = ref.resize((ref.width*4, ref.height*4), Image.NEAREST)
refbig.save('D:/dsh-plugin/dsh-im-companion/ref-tab2-zoom.png')
print('saved ref')
