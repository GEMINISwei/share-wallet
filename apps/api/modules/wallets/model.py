import uuid
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import TypedDict, cast

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    delete,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.session import resolve_session
from shared.db.table import BaseTable, parse_uuid
from shared.time import utc_now


class WalletKind(StrEnum):
    """錢包的類型, 建立後不能改。"""

    GENERAL = "general"
    TRAVEL = "travel"


class MemberRole(StrEnum):
    """成員在這個錢包裡的角色。"""

    ADMIN = "admin"
    MEMBER = "member"


class CategoryType(StrEnum):
    """分類的類型, 建立後不能改。"""

    INCOME = "income"
    EXPENSE = "expense"


class WalletDetail(TypedDict):
    """`find_detail_*` 回傳的 dict 形狀 (理由見 shared/db/table.py 的 `to_detail`)。"""

    id: str
    kind: WalletKind
    name: str
    balance: int
    destination: str | None
    start_date: date | None
    end_date: date | None
    created_at: datetime


class JoinedWallet(TypedDict):
    wallet: WalletDetail
    role: MemberRole


class MemberDetail(TypedDict):
    user_id: str
    role: MemberRole


class CategoryDetail(TypedDict):
    id: str
    wallet_id: str
    type: CategoryType
    name: str
    archived_at: datetime | None


class WalletTable(BaseTable):
    __tablename__ = "wallets"

    # 存字串而不是 PostgreSQL enum: 加一種錢包時 enum 型別要另寫 `ALTER TYPE`, 而且不能在
    # 交易裡跑; 合法值由 schema 的 enum 與下面的 CHECK 守住。
    kind: Mapped[str] = mapped_column(String)
    name: Mapped[str]
    # 餘額是存起來的值 (記帳時當下更新), 不是顯示時才從明細加總, 見 docs/features.md〈餘額〉。
    # 旅遊錢包沒有餘額, 但仍是 0 而不是 NULL: 列表的加總只看一般錢包, 不必處理 NULL。
    balance: Mapped[int] = mapped_column(BigInteger, default=0)
    destination: Mapped[str | None] = mapped_column(String, default=None)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)

    __table_args__ = (
        CheckConstraint("kind IN ('general', 'travel')", name="kind"),
        CheckConstraint("end_date >= start_date", name="end_not_before_start"),
    )

    # 收窄回傳型別, 理由與 `ignore[override]` 的必要性見 modules/roles/model.py 的同一處。
    @classmethod
    async def find_detail_by_id(  # type: ignore[override]
        cls, id: str, session: AsyncSession | None = None
    ) -> WalletDetail | None:
        return cast(WalletDetail | None, await super().find_detail_by_id(id, session))

    @classmethod
    async def lock_by_id(cls, id: str, session: AsyncSession | None = None) -> None:
        """鎖住錢包這一列直到交易結束。

        成員的升降、移除與離開都要先鎖: 「至少一位管理者」是先數再改, 兩位管理者同時把
        對方降為成員時, 不鎖的話兩邊都數到 2、都放行, 錢包就沒有管理者了。
        """
        row_id = parse_uuid(id)
        if row_id is None:
            return
        db = resolve_session(session)
        await db.execute(select(cls.id).where(cls.id == row_id).with_for_update())

    @classmethod
    async def find_joined(cls, user_id: str) -> list[JoinedWallet]:
        """這個使用者加入的所有錢包與他的角色, 依加入的先後排序。"""
        row_id = parse_uuid(user_id)
        if row_id is None:
            return []
        statement = (
            select(cls, WalletMemberTable.role)
            .join(WalletMemberTable, WalletMemberTable.wallet_id == cls.id)
            .where(WalletMemberTable.user_id == row_id)
            .order_by(WalletMemberTable.created_at.asc(), cls.id.asc())
        )
        rows = (await resolve_session(None).execute(statement)).all()
        return [
            {"wallet": cast(WalletDetail, wallet.to_detail()), "role": MemberRole(role)}
            for wallet, role in rows
        ]

    @classmethod
    async def delete_by_id(cls, id: str) -> bool:
        """真的刪除, 成員與分類由外鍵的 `ON DELETE CASCADE` 一起刪掉。

        這個模板其他的 DELETE 都是停用, 錢包例外: 規格要求刪除是永久的
        (見 docs/features.md〈刪除錢包〉), 留著列只會讓每個查詢都要記得過濾。
        """
        row_id = parse_uuid(id)
        if row_id is None:
            return False
        result = await resolve_session(None).execute(
            delete(cls).where(cls.id == row_id).returning(cls.id)
        )
        return result.first() is not None


class WalletMemberTable(BaseTable):
    __tablename__ = "wallet_members"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    # 外鍵用字串指名 `users.id` 而不 import users 的 model: 跨模組只能經過 public,
    # 而這裡要的只是資料庫層的參照。使用者被刪掉時他的成員紀錄跟著消失。
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String)

    __table_args__ = (
        UniqueConstraint("wallet_id", "user_id"),
        CheckConstraint("role IN ('admin', 'member')", name="role"),
    )

    @classmethod
    def _key(cls, wallet_id: str, user_id: str) -> list:
        return [
            cls.wallet_id == parse_uuid(wallet_id),
            cls.user_id == parse_uuid(user_id),
        ]

    @classmethod
    async def find_role(cls, wallet_id: str, user_id: str) -> MemberRole | None:
        if parse_uuid(wallet_id) is None or parse_uuid(user_id) is None:
            return None
        role = await resolve_session(None).scalar(
            select(cls.role).where(*cls._key(wallet_id, user_id))
        )
        return None if role is None else MemberRole(role)

    @classmethod
    async def list_members(cls, wallet_id: str) -> list[MemberDetail]:
        """依加入的先後排序。"""
        rows = (
            await resolve_session(None).execute(
                select(cls.user_id, cls.role)
                .where(cls.wallet_id == parse_uuid(wallet_id))
                .order_by(cls.created_at.asc(), cls.id.asc())
            )
        ).all()
        return [{"user_id": str(user_id), "role": MemberRole(role)} for user_id, role in rows]

    @classmethod
    async def count_admins(cls, wallet_id: str) -> int:
        count = await resolve_session(None).scalar(
            select(func.count())
            .select_from(cls)
            .where(cls.wallet_id == parse_uuid(wallet_id), cls.role == MemberRole.ADMIN)
        )
        return count or 0

    @classmethod
    async def set_role(cls, wallet_id: str, user_id: str, role: MemberRole) -> None:
        row = await resolve_session(None).scalar(select(cls).where(*cls._key(wallet_id, user_id)))
        if row is not None and row.role != role:
            row.role = role
            row.updated_at = utc_now()
            await resolve_session(None).flush()

    @classmethod
    async def remove(cls, wallet_id: str, user_id: str) -> None:
        await resolve_session(None).execute(delete(cls).where(*cls._key(wallet_id, user_id)))


class WalletCategoryTable(BaseTable):
    __tablename__ = "wallet_categories"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String)
    name: Mapped[str]
    # 刪除分類是封存 (見 docs/features.md〈分類〉): 帳目引用著它, 舊帳要照樣顯示原本的名稱。
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)

    __table_args__ = (
        CheckConstraint("type IN ('income', 'expense')", name="type"),
        # 名稱不能重複只看還沒封存的: 封存之後要能再建同名的分類。service 會先查一次給出
        # 好讀的錯誤, 這個索引擋的是兩個請求同時新增。
        Index(
            "uq_wallet_categories_active_name",
            "wallet_id",
            "type",
            "name",
            unique=True,
            postgresql_where="archived_at IS NULL",
        ),
    )

    @classmethod
    def _active(cls, wallet_id: str) -> list:
        return [cls.wallet_id == parse_uuid(wallet_id), cls.archived_at.is_(None)]

    @classmethod
    async def create_many(cls, wallet_id: str, items: list[tuple[CategoryType, str]]) -> None:
        """依序建立, 順序就是清單上的順序。

        `created_at` 逐筆錯開一微秒: 清單依 `created_at` 排序, 同一批寫入的時間可能相同,
        那時 tie-breaker 是隨機的 uuid, 預設分類的順序 (「其他」排最後) 就會亂掉。
        """
        db = resolve_session(None)
        now = utc_now()
        for index, (category_type, name) in enumerate(items):
            db.add(
                cls(
                    wallet_id=parse_uuid(wallet_id),
                    type=category_type,
                    name=name,
                    created_at=now + timedelta(microseconds=index),
                )
            )
        await db.flush()

    @classmethod
    async def list_active(cls, wallet_id: str) -> list[CategoryDetail]:
        if parse_uuid(wallet_id) is None:
            return []
        result = await cls.get_all(where=cls._active(wallet_id))
        return cast(list[CategoryDetail], result["list_data"])

    @classmethod
    async def find_detail_active(cls, wallet_id: str, id: str) -> CategoryDetail | None:
        row_id = parse_uuid(id)
        if row_id is None or parse_uuid(wallet_id) is None:
            return None
        result = await cls.find_detail_one(cls.id == row_id, *cls._active(wallet_id))
        return cast(CategoryDetail | None, result)

    @classmethod
    async def name_taken(
        cls,
        wallet_id: str,
        category_type: CategoryType,
        name: str,
        exclude_id: str | None = None,
    ) -> bool:
        conditions = [*cls._active(wallet_id), cls.type == category_type, cls.name == name]
        if exclude_id is not None:
            conditions.append(cls.id != parse_uuid(exclude_id))
        found = await resolve_session(None).scalar(select(cls.id).where(*conditions).limit(1))
        return found is not None
