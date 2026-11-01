"""travel wallets without groups

Revision ID: 03c5dadf6028
Revises: e52b7f15abf0
Create Date: 2026-11-01 14:00:37.469498

旅遊錢包不再分群組: 群組的用處是分開看總額, 旅遊錢包沒有餘額可以加總, 已結帳的又會沉到列表最後,
分組只是多一層要整理的東西 (見 docs/features/wallets.md〈錢包群組〉)。

- 旅遊錢包的成員紀錄 `group_id` 改成 NULL, 所以欄位先改成可以是 NULL; 一般錢包一定有群組由 service 保證,
  CHECK 跨不到 wallets 表看類型。
- 旅遊群組 (含預設的) 整批刪掉, 裡面的錢包上一步已經移出來。只剩一般群組, `kind` 欄位跟著拿掉,
  兩個唯一索引改成每個人一份。
- downgrade 把每個有旅遊錢包的人補回一個旅遊預設群組, 旅遊錢包都放回那裡; 原本的自訂旅遊群組回不來。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '03c5dadf6028'
down_revision: str | Sequence[str] | None = 'e52b7f15abf0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column('wallet_members', 'group_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.execute(
        "UPDATE wallet_members SET group_id = NULL FROM wallets"
        " WHERE wallets.id = wallet_members.wallet_id AND wallets.kind = 'travel'"
    )
    op.execute("DELETE FROM wallet_groups WHERE kind = 'travel'")

    op.drop_index(op.f('uq_wallet_groups_default'), table_name='wallet_groups', postgresql_where='is_default')
    op.create_index('uq_wallet_groups_default', 'wallet_groups', ['user_id'], unique=True, postgresql_where='is_default')
    op.drop_index(op.f('uq_wallet_groups_name'), table_name='wallet_groups', postgresql_where='(NOT is_default)')
    op.create_index('uq_wallet_groups_name', 'wallet_groups', ['user_id', 'name'], unique=True, postgresql_where='NOT is_default')
    op.drop_constraint(op.f('ck_wallet_groups_kind'), 'wallet_groups', type_='check')
    op.drop_column('wallet_groups', 'kind')


def downgrade() -> None:
    op.add_column('wallet_groups', sa.Column('kind', sa.VARCHAR(), server_default='general', autoincrement=False, nullable=False))
    op.alter_column('wallet_groups', 'kind', server_default=None)
    op.create_check_constraint(op.f('ck_wallet_groups_kind'), 'wallet_groups', "kind IN ('general', 'travel')")
    op.drop_index('uq_wallet_groups_name', table_name='wallet_groups', postgresql_where='NOT is_default')
    op.create_index(op.f('uq_wallet_groups_name'), 'wallet_groups', ['user_id', 'kind', 'name'], unique=True, postgresql_where='(NOT is_default)')
    op.drop_index('uq_wallet_groups_default', table_name='wallet_groups', postgresql_where='is_default')
    op.create_index(op.f('uq_wallet_groups_default'), 'wallet_groups', ['user_id', 'kind'], unique=True, postgresql_where='is_default')

    op.execute(
        "INSERT INTO wallet_groups (id, created_at, user_id, kind, name, is_default, position)"
        " SELECT gen_random_uuid(), now() AT TIME ZONE 'utc', members.user_id, 'travel', NULL, true, 0"
        " FROM (SELECT DISTINCT user_id FROM wallet_members WHERE group_id IS NULL) AS members"
    )
    op.execute(
        "UPDATE wallet_members SET group_id = wallet_groups.id FROM wallet_groups"
        " WHERE wallet_members.group_id IS NULL AND wallet_groups.user_id = wallet_members.user_id"
        " AND wallet_groups.kind = 'travel' AND wallet_groups.is_default"
    )
    op.alter_column('wallet_members', 'group_id',
               existing_type=sa.UUID(),
               nullable=False)
