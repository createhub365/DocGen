import os

from fastapi import HTTPException, UploadFile

DOCX_EXTENSIONS = {".docx"}
DOCX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_TEMPLATE_SIZE = 20 * 1024 * 1024
MAX_LOGO_SIZE = 5 * 1024 * 1024


def remove_file(path: str):
    try:
        if path and os.path.exists(path):
            os.unlink(path)
    except OSError:
        pass


def safe_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks."""
    filename = os.path.basename(filename or "")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return filename


def safe_join(directory: str, filename: str) -> str:
    """Safely join directory + filename, preventing path traversal."""
    filename = safe_filename(filename)
    full_path = os.path.realpath(os.path.join(directory, filename))
    base_path = os.path.realpath(directory)
    if not full_path.startswith(base_path + os.sep) and full_path != base_path:
        raise HTTPException(status_code=400, detail="Invalid file path")
    return full_path


def safe_join_relative(base_directory: str, relative_path: str) -> str:
    """Join base directory + relative subpath (e.g. thumbnails/thumb_1.png)."""
    base_path = os.path.realpath(base_directory)
    rel = (relative_path or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(status_code=400, detail="Invalid file path")
    full_path = os.path.realpath(os.path.join(base_path, *rel.split("/")))
    if not full_path.startswith(base_path + os.sep) and full_path != base_path:
        raise HTTPException(status_code=400, detail="Invalid file path")
    return full_path


def validate_docx(file: UploadFile) -> None:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in DOCX_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .docx files allowed")
    if file.content_type and file.content_type not in DOCX_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid MIME type for DOCX")


def validate_image(file: UploadFile) -> None:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, WEBP images allowed")
    if file.content_type and file.content_type not in IMAGE_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid MIME type for image")


def validate_docx_upload(filename: str | None, content_type: str | None, size: int | None = None) -> None:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in DOCX_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .docx files allowed")
    if content_type and content_type not in DOCX_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type")
    if size is not None and size > MAX_TEMPLATE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20MB limit")


def validate_logo_upload(filename: str | None, content_type: str | None, size: int) -> None:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, and WEBP files allowed")
    if content_type and content_type not in IMAGE_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type")
    if size > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit")
