import fitz
from pathlib import Path
p = Path('GANESHANUK.pdf')
if not p.exists():
    raise FileNotFoundError(f"{p} not found")
doc = fitz.open(str(p))
with open('ganeshanuk_analysis.txt', 'w', encoding='utf-8') as f:
    f.write(f'exists {p.exists()}\n')
    f.write(f'pages {len(doc)}\n')
    for page_number, page in enumerate(doc, start=1):
        f.write(f'---PAGE {page_number} rect {page.rect}\n')
        images = page.get_images(full=True)
        f.write(f'images {len(images)}\n')
        for im_idx, img in enumerate(images, start=1):
            f.write(f' image {im_idx} {img[:5]}\n')
        text = page.get_text('dict')
        for bi, block in enumerate(text['blocks']):
            if block['type'] != 0:
                continue
            f.write(f' BLOCK {bi} lines {len(block["lines"])}\n')
            for line in block['lines']:
                text_line = ' '.join(span['text'] for span in line['spans'])
                f.write(f'  y={line["bbox"][1]} text={text_line}\n')
print('analysis written to ganeshanuk_analysis.txt')
