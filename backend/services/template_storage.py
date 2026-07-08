from fastapi import HTTPException

from services.logo_storage import resolve_template_local_path


def require_template_docx_path(filename: str, template_dir: str) -> str:
    path = resolve_template_local_path(filename, template_dir)
    if not path:
        raise HTTPException(
            status_code=404,
            detail="Template file not found. Re-upload the template from Admin Panel.",
        )
    return path
