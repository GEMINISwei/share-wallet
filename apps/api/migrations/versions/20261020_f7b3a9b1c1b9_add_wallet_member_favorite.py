"""add wallet member favorite

Revision ID: f7b3a9b1c1b9
Revises: 67e9eb35c4cb
Create Date: 2026-10-20 22:05:42.213033

錢包的最愛 (見 docs/features.md〈錢包列表〉)。

- `wallet_members.is_favorite`: 最愛是每個人自己的標記, 放在成員紀錄上。既有的成員都還沒設,
  靠 server default `false` 把現有的列填好; default 留著不拿掉, 因為 `add_if_absent` 是
  直接 INSERT, 不經過 ORM 的預設值也要有值。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7b3a9b1c1b9"
down_revision: str | Sequence[str] | None = "67e9eb35c4cb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "wallet_members",
        sa.Column("is_favorite", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("wallet_members", "is_favorite")
