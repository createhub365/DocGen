"""Re-hash demo user passwords (run if login fails after auth changes)."""
from database import SessionLocal
import models
from auth import hash_password

DEMO_USERS = [
    ("admin", "admin123", "admin"),
    ("staff", "staff123", "staff"),
]


def reset():
    db = SessionLocal()
    try:
        for username, password, role in DEMO_USERS:
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                user.password_hash = hash_password(password)
                user.role = role
            else:
                db.add(
                    models.User(
                        username=username,
                        password_hash=hash_password(password),
                        role=role,
                    )
                )
        db.commit()
        print("Passwords reset for: admin, staff")
    finally:
        db.close()


if __name__ == "__main__":
    reset()
