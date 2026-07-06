import glob
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.pdf_converter import try_convert_to_pdf

templates = glob.glob(os.path.join("template_store", "*.docx"))
if not templates:
    print("no template in template_store")
    sys.exit(1)

docx = os.path.abspath(templates[0])
out = tempfile.mkdtemp()
pdf, err = try_convert_to_pdf(docx, out)
if not pdf:
    print("FAIL", err)
    sys.exit(1)
print("OK", pdf, os.path.exists(pdf))
