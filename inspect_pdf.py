from pathlib import Path
from pypdf import PdfReader
p = Path('GANESHANUK.pdf')
print('exists', p.exists())
reader = PdfReader(str(p))
print('pages', len(reader.pages))
for i, page in enumerate(reader.pages):
    print('---PAGE', i, '---')
    print(page.extract_text())
    print('---END---')
