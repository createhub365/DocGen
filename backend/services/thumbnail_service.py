import os

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from services.logo_storage import public_url_for_stored_path
from utils.file_utils import safe_join_relative


def serve_template_thumbnail(template, template_dir: str):
    if not template or not template.thumbnail_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    public_url = public_url_for_stored_path(template.thumbnail_path)
    if public_url:
        return RedirectResponse(public_url, headers={"Cache-Control": "max-age=3600"})

    thumb_path = safe_join_relative(template_dir, template.thumbnail_path)
    if os.path.exists(thumb_path):
        return FileResponse(
            thumb_path,
            media_type="image/png",
            headers={"Cache-Control": "max-age=3600"},
        )

    raise HTTPException(status_code=404, detail="Thumbnail file not found")


def persist_generated_thumbnail(
    template,
    db,
    thumb_rel: str | None,
    template_dir: str,
) -> None:
    if not thumb_rel:
        return

    thumbnail_dir = os.path.join(template_dir, "thumbnails")
    thumb_abs = safe_join_relative(template_dir, thumb_rel)
    if not os.path.exists(thumb_abs):
        template.thumbnail_path = thumb_rel
        db.commit()
        db.refresh(template)
        return

    from services.logo_storage import save_thumbnail

    with open(thumb_abs, "rb") as handle:
        content = handle.read()
    template.thumbnail_path = save_thumbnail(
        content,
        os.path.basename(thumb_abs),
        thumbnail_dir,
    )
    db.commit()
    db.refresh(template)
