import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from database import SessionLocal
from models import Template
from services.thumbnail_gen import generate_docx_thumbnail

TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")
thumbnail_dir = os.path.join(TEMPLATE_DIR, "thumbnails")

db = SessionLocal()
templates = db.query(Template).filter(Template.is_active == True).all()

print(f"Found {len(templates)} active templates")
success = 0
failed = 0

for t in templates:
    docx_path = os.path.join(TEMPLATE_DIR, t.docx_filename)

    if not os.path.exists(docx_path):
        print(f"  SKIP [{t.id}] file missing")
        failed += 1
        continue

    result = generate_docx_thumbnail(
        docx_path=docx_path,
        thumbnail_dir=thumbnail_dir,
        template_id=t.id,
    )

    if result:
        t.thumbnail_path = result
        print(f"  OK   [{t.id}]")
        success += 1
    else:
        print(f"  FAIL [{t.id}]")
        failed += 1

db.commit()
db.close()
print(f"\nDone — OK: {success} | Failed: {failed}")
