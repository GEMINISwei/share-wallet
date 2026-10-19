"""add travel settlement

Revision ID: 67e9eb35c4cb
Revises: 8dde774caa01
Create Date: 2026-10-19 11:20:46.674481

旅遊錢包的結算 (見 docs/features.md〈結算流程〉〈封存〉)。

- `wallets.status`: 既有的錢包都還沒結算, 先帶 server default `'active'` 把現有的列填好,
  再拿掉 default, 跟 model 一樣由程式給值。兩個 CHECK 是手寫的, autogenerate 不比對 CHECK。
- `travel_settlement_transfers`: 新表, 沒有資料要回填。付款人、收款人、確認者指向使用者、
  不設 ON DELETE, 理由同 `travel_expenses.payer_id`。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "67e9eb35c4cb"
down_revision: str | Sequence[str] | None = "8dde774caa01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "travel_settlement_transfers",
        sa.Column("wallet_id", sa.UUID(), nullable=False),
        sa.Column("from_user_id", sa.UUID(), nullable=False),
        sa.Column("to_user_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "(confirmed_at IS NULL) = (confirmed_by IS NULL)",
            name=op.f("ck_travel_settlement_transfers_confirmed_pair"),
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_travel_settlement_transfers_amount")),
        sa.ForeignKeyConstraint(
            ["confirmed_by"],
            ["users.id"],
            name=op.f("fk_travel_settlement_transfers_confirmed_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["from_user_id"],
            ["users.id"],
            name=op.f("fk_travel_settlement_transfers_from_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["to_user_id"],
            ["users.id"],
            name=op.f("fk_travel_settlement_transfers_to_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["wallet_id"],
            ["wallets.id"],
            name=op.f("fk_travel_settlement_transfers_wallet_id_wallets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_travel_settlement_transfers")),
        sa.UniqueConstraint(
            "wallet_id", "position", name=op.f("uq_travel_settlement_transfers_wallet_id")
        ),
    )
    op.add_column(
        "wallets", sa.Column("status", sa.String(), nullable=False, server_default="active")
    )
    op.alter_column("wallets", "status", server_default=None)
    op.create_check_constraint(
        op.f("ck_wallets_status"), "wallets", "status IN ('active', 'settling', 'settled')"
    )
    op.create_check_constraint(
        op.f("ck_wallets_only_travel_settles"), "wallets", "kind = 'travel' OR status = 'active'"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_wallets_only_travel_settles"), "wallets", type_="check")
    op.drop_constraint(op.f("ck_wallets_status"), "wallets", type_="check")
    op.drop_column("wallets", "status")
    op.drop_table("travel_settlement_transfers")
