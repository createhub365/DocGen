"""Guard: seed must not insert appointment-letter demo rows into a populated DB."""
from __future__ import annotations

from auth import hash_password
from models import Company, Country, DocumentType, Template, Trade, User


def test_seed_skips_appointment_letter_when_users_exist(db):
    """
    With at least one user present, seed() must skip entirely — including
    ensure_appointment_letter (which previously ran before the user-count guard).
    """
    # Catalog rows that would let ensure_appointment_letter create a template
    # if it were still called on a populated DB.
    canada = Country(name="Canada", code="ca")
    db.add(canada)
    db.flush()
    construction = Trade(name="Construction Worker", country_id=canada.id)
    db.add(construction)
    db.flush()
    buildright = Company(
        name="BuildRight Corp",
        trade_id=construction.id,
        country_id=canada.id,
    )
    db.add(buildright)
    db.add(
        User(
            username="existing_prod_user",
            full_name="Existing User",
            password_hash=hash_password("already-here"),
            role="admin",
            is_active=True,
        )
    )
    db.commit()

    assert db.query(User).count() == 1
    assert (
        db.query(DocumentType)
        .filter(DocumentType.slug == "appointment_letter")
        .count()
        == 0
    )
    templates_before = db.query(Template).count()

    from seed import seed

    seed()

    db.expire_all()
    assert db.query(User).count() == 1
    assert (
        db.query(DocumentType)
        .filter(DocumentType.slug == "appointment_letter")
        .count()
        == 0
    )
    assert db.query(Template).count() == templates_before
