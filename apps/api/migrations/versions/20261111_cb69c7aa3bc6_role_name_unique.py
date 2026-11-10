"""role name unique

Revision ID: cb69c7aa3bc6
Revises: 03c5dadf6028
Create Date: 2026-11-11 00:17:08.560098

角色名稱改成唯一: 指派角色時畫面上只看得到名稱, 同名的兩個角色會讓管理者分不清。service 建立與改名前
會先查一次, 同時到的兩個請求由這個約束接住 (回 409)。停用的與系統角色也占用名稱。

已有同名角色的資料庫跑這支會失敗, 刻意不自動改名: 哪一個該改名要由管理者決定。
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'cb69c7aa3bc6'
down_revision: str | Sequence[str] | None = '03c5dadf6028'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(op.f('uq_roles_name'), 'roles', ['name'])


def downgrade() -> None:
    op.drop_constraint(op.f('uq_roles_name'), 'roles', type_='unique')
