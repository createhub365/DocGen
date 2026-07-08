import os

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response

from services.logo_storage import is_remote_path, read_stored_file_bytes
from utils.file_utils import safe_join_relative


def serve_template_thumbnail(template, template_dir: str):
    if not template or not template.thumbnail_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    if is_remote_path(template.thumbnail_path):
        payload = read_stored_file_bytes(template.thumbnail_path, template_dir)
        if not payload:
            raise HTTPException(status_code=404, detail="Thumbnail file not found")
        data, media_type = payload
        return Response(
            content=data,
            media_type=media_type,
            headers={"Cache-Control": "max-age=3600"},
        )

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
