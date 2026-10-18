import base64
import json
import uuid
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Literal, TypedDict, cast

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Select,
    String,
    UniqueConstraint,
    delete,
    desc,
    func,
    select,
    tuple_,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.query import ilike_contains
from shared.db.session import resolve_session
from shared.db.table import BaseTable, Condition, PagedResult, PaginationError, parse_uuid
from shared.http.errors import LangException
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


class EntryKind(StrEnum):
    """一般錢包的帳目種類。"""

    INCOME = "income"
    EXPENSE = "expense"
    ADJUSTMENT = "adjustment"


class EntryLogAction(StrEnum):
    """異動紀錄的動作。"""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


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


class InviteDetail(TypedDict):
    wallet_id: str
    token: str
    expires_at: datetime


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
        # 後台列出所有錢包時的游標分頁 (排序鍵是 created_at + id, 見 `get_page`)。
        Index("ix_wallets_created_at_id", desc("created_at"), desc("id")),
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
    async def lock_balance(cls, id: str) -> int | None:
        """鎖住錢包這一列並讀出目前的餘額; 錢包不存在時是 None。

        記帳、修改、刪除都先經過這裡再 `set_balance`: 兩筆同時記帳時, 後到的那一筆要等前一筆
        的交易結束才讀得到餘額, 不鎖的話兩邊讀到同一個舊值, 其中一筆的金額就消失了。
        只選欄位而不是整個 ORM 物件, 是為了繞過 session 的 identity map: 同一個請求稍早
        (`open_wallet`) 讀過的錢包物件是鎖之前的值。
        """
        row_id = parse_uuid(id)
        if row_id is None:
            return None
        return await resolve_session(None).scalar(
            select(cls.balance).where(cls.id == row_id).with_for_update()
        )

    @classmethod
    async def set_balance(cls, id: str, balance: int) -> None:
        """只在 `lock_balance` 之後呼叫, 理由見那裡。"""
        await resolve_session(None).execute(
            update(cls)
            .where(cls.id == parse_uuid(id))
            .values(balance=balance, updated_at=utc_now())
        )

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
    async def find_page(
        cls,
        limit: int,
        cursor: str | None = None,
        direction: Literal["next", "prev"] = "next",
        name: str | None = None,
        kind: WalletKind | None = None,
    ) -> PagedResult:
        """所有錢包 (不看成員), 給後台用。"""
        filters: list[Condition] = []
        if name:
            filters.append(ilike_contains(cls.name, name))
        if kind is not None:
            filters.append(cls.kind == kind)
        return await cls.get_page(where=filters, cursor=cursor, direction=direction, limit=limit)

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
    async def list_by_wallets(cls, wallet_ids: list[str]) -> dict[str, list[MemberDetail]]:
        """多個錢包的成員, 一次查完 (後台列表的一頁)。每個錢包內依加入的先後排序。"""
        parsed = [row_id for wallet_id in wallet_ids if (row_id := parse_uuid(wallet_id))]
        result: dict[str, list[MemberDetail]] = {wallet_id: [] for wallet_id in wallet_ids}
        if not parsed:
            return result
        rows = (
            await resolve_session(None).execute(
                select(cls.wallet_id, cls.user_id, cls.role)
                .where(cls.wallet_id.in_(parsed))
                .order_by(cls.created_at.asc(), cls.id.asc())
            )
        ).all()
        for wallet_id, user_id, role in rows:
            result[str(wallet_id)].append({"user_id": str(user_id), "role": MemberRole(role)})
        return result

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

    @classmethod
    async def add_if_absent(cls, wallet_id: str, user_id: str, role: MemberRole) -> None:
        """已經是成員時什麼都不做 (角色不變)。

        用 `ON CONFLICT DO NOTHING` 而不是先查再寫: 同一個人連按兩次加入時, 兩個請求都會
        查到「還不是成員」, 第二個寫入就撞唯一約束變成 500。
        """
        await resolve_session(None).execute(
            pg_insert(cls)
            .values(
                id=uuid.uuid4(),
                created_at=utc_now(),
                wallet_id=parse_uuid(wallet_id),
                user_id=parse_uuid(user_id),
                role=role,
            )
            .on_conflict_do_nothing(index_elements=["wallet_id", "user_id"])
        )


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
    async def find_detail_in_wallet(cls, wallet_id: str, id: str) -> CategoryDetail | None:
        """含已封存的: 修改帳目時可以保留它原本 (已封存) 的分類。"""
        row_id = parse_uuid(id)
        if row_id is None or parse_uuid(wallet_id) is None:
            return None
        result = await cls.find_detail_one(cls.id == row_id, cls.wallet_id == parse_uuid(wallet_id))
        return cast(CategoryDetail | None, result)

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


class WalletInviteTable(BaseTable):
    __tablename__ = "wallet_invites"

    # 唯一: 每個錢包同時只有一條連結, 重新產生就是覆蓋這一列 (見 `replace`)。
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE"), unique=True
    )
    # 存原文而不是雜湊: 有效期內管理者要能再看到同一條連結 (見 docs/features.md〈邀請連結〉)。
    # 連結一天就過期、只能以成員身分加入, 外洩的代價有限。
    token: Mapped[str] = mapped_column(String, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))

    @staticmethod
    def _detail(row: WalletInviteTable) -> InviteDetail:
        return {"wallet_id": str(row.wallet_id), "token": row.token, "expires_at": row.expires_at}

    @classmethod
    async def find_detail_by_wallet(cls, wallet_id: str) -> InviteDetail | None:
        """含已過期的; 過期與否由 service 依「現在」判斷。"""
        row_id = parse_uuid(wallet_id)
        if row_id is None:
            return None
        row = await resolve_session(None).scalar(select(cls).where(cls.wallet_id == row_id))
        return None if row is None else cls._detail(row)

    @classmethod
    async def find_detail_by_token(cls, token: str) -> InviteDetail | None:
        """含已過期的, 同 `find_detail_by_wallet`。"""
        row = await resolve_session(None).scalar(select(cls).where(cls.token == token))
        return None if row is None else cls._detail(row)

    @classmethod
    async def replace(cls, wallet_id: str, token: str, expires_at: datetime) -> None:
        """產生或重新產生: 錢包已經有連結時換成新的 token, 舊的立即失效。"""
        now = utc_now()
        statement = pg_insert(cls).values(
            id=uuid.uuid4(),
            created_at=now,
            wallet_id=parse_uuid(wallet_id),
            token=token,
            expires_at=expires_at,
        )
        await resolve_session(None).execute(
            statement.on_conflict_do_update(
                index_elements=["wallet_id"],
                set_={"token": token, "expires_at": expires_at, "updated_at": now},
            )
        )

    @classmethod
    async def remove(cls, wallet_id: str) -> None:
        row_id = parse_uuid(wallet_id)
        if row_id is not None:
            await resolve_session(None).execute(delete(cls).where(cls.wallet_id == row_id))


class EntryDetail(TypedDict):
    id: str
    wallet_id: str
    kind: EntryKind
    #: 收入與支出是正數; 調整是差額, 可以是負的。
    amount: int
    category_id: str | None
    #: 分類目前的名稱 (含已封存的); 調整沒有分類。
    category_name: str | None
    entry_date: date
    note: str
    created_by: str
    created_at: datetime


class EntryPageResult(TypedDict):
    list_data: list[EntryDetail]
    next_cursor: str | None


class EntryLogDetail(TypedDict):
    id: str
    entry_id: str
    action: EntryLogAction
    actor_id: str
    as_super_admin: bool
    before: dict | None
    after: dict | None
    created_at: datetime


class EntryLogPageResult(TypedDict):
    list_data: list[EntryLogDetail]
    next_cursor: str | None


def _encode_keys(*values: date | datetime | uuid.UUID) -> str:
    raw = json.dumps(
        [str(value) if isinstance(value, uuid.UUID) else value.isoformat() for value in values]
    )
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_keys(cursor: str, count: int) -> list[str]:
    try:
        values = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except (ValueError, TypeError) as exc:
        raise LangException(400, PaginationError.INVALID_CURSOR) from exc
    if not isinstance(values, list) or len(values) != count:
        raise LangException(400, PaginationError.INVALID_CURSOR)
    return [str(value) for value in values]


class WalletEntryTable(BaseTable):
    __tablename__ = "wallet_entries"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String)
    amount: Mapped[int] = mapped_column(BigInteger)
    # 分類只會被封存、不會被刪掉 (錢包刪除時兩邊一起 cascade), 所以外鍵不設 ON DELETE。
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_categories.id"), default=None
    )
    entry_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String, default="")
    # 指向使用者而不是成員紀錄: 記帳人離開錢包後帳目照樣保留 (見 docs/features.md〈離開與移除〉)。
    # 不設 ON DELETE: 使用者只會被停用, 不會被刪除。
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    __table_args__ = (
        CheckConstraint("kind IN ('income', 'expense', 'adjustment')", name="kind"),
        # 只有調整的差額可以是負的 (見 docs/features.md〈金額〉)。
        CheckConstraint(
            "(kind = 'adjustment' AND amount <> 0) OR (kind <> 'adjustment' AND amount > 0)",
            name="amount",
        ),
        CheckConstraint(
            "(kind = 'adjustment') = (category_id IS NULL)", name="category_only_for_income_expense"
        ),
        # 錢包頁的列表: 日期新到舊, 同一天依記帳時間新到舊 (見 `find_page`)。
        Index(
            "ix_wallet_entries_wallet_list",
            "wallet_id",
            desc("entry_date"),
            desc("created_at"),
            desc("id"),
        ),
    )

    @classmethod
    def _detail_select(cls) -> Select:
        return select(cls, WalletCategoryTable.name).outerjoin(
            WalletCategoryTable, WalletCategoryTable.id == cls.category_id
        )

    @staticmethod
    def _detail(row: WalletEntryTable, category_name: str | None) -> EntryDetail:
        return {
            "id": str(row.id),
            "wallet_id": str(row.wallet_id),
            "kind": EntryKind(row.kind),
            "amount": row.amount,
            "category_id": None if row.category_id is None else str(row.category_id),
            "category_name": category_name,
            "entry_date": row.entry_date,
            "note": row.note,
            "created_by": str(row.created_by),
            "created_at": row.created_at,
        }

    @classmethod
    async def find_detail_in_wallet(cls, wallet_id: str, id: str) -> EntryDetail | None:
        """只找這個錢包裡的帳: 拿別的錢包的 id 打進來要是「帳目不存在」。"""
        wallet_uuid, row_id = parse_uuid(wallet_id), parse_uuid(id)
        if wallet_uuid is None or row_id is None:
            return None
        statement = cls._detail_select().where(cls.id == row_id, cls.wallet_id == wallet_uuid)
        found = (await resolve_session(None).execute(statement)).first()
        return None if found is None else cls._detail(*found)

    @classmethod
    async def find_page(
        cls, wallet_id: str, limit: int, cursor: str | None = None
    ) -> EntryPageResult:
        """日期新到舊, 同一天依記帳時間新到舊, 只往下一頁 (「載入更多」)。

        不用 `BaseTable.get_page`: 它的排序鍵只有一個欄位加 id, 這裡要先排日期再排記帳時間,
        只用日期的話同一天的帳會依隨機的 uuid 排。
        """
        keys = (cls.entry_date, cls.created_at, cls.id)
        statement = cls._detail_select().where(cls.wallet_id == parse_uuid(wallet_id))
        if cursor is not None:
            day, created_at, row_id = _decode_keys(cursor, 3)
            try:
                after = (
                    date.fromisoformat(day),
                    datetime.fromisoformat(created_at),
                    uuid.UUID(row_id),
                )
            except ValueError as exc:
                raise LangException(400, PaginationError.INVALID_CURSOR) from exc
            statement = statement.where(tuple_(*keys) < tuple_(*after))
        statement = statement.order_by(*(key.desc() for key in keys)).limit(limit + 1)
        rows = (await resolve_session(None).execute(statement)).all()
        page = [cls._detail(row, name) for row, name in rows[:limit]]
        last = rows[limit - 1][0] if len(rows) > limit else None
        next_cursor = (
            None if last is None else _encode_keys(last.entry_date, last.created_at, last.id)
        )
        return {"list_data": page, "next_cursor": next_cursor}

    @classmethod
    async def delete_in_wallet(cls, wallet_id: str, id: str) -> None:
        await resolve_session(None).execute(
            delete(cls).where(cls.id == parse_uuid(id), cls.wallet_id == parse_uuid(wallet_id))
        )


class WalletEntryLogTable(BaseTable):
    __tablename__ = "wallet_entry_logs"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    # 刻意不設外鍵: 帳目刪掉之後, 它的異動紀錄 (含「刪除」那一筆) 要留著。
    entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    as_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # 存當時的快照 (含分類名稱) 而不是參照: 之後分類改名或帳目再被改, 舊紀錄不能跟著變。
    before: Mapped[dict | None] = mapped_column(JSONB, default=None)
    after: Mapped[dict | None] = mapped_column(JSONB, default=None)

    __table_args__ = (
        CheckConstraint("action IN ('create', 'update', 'delete')", name="action"),
        Index("ix_wallet_entry_logs_wallet_list", "wallet_id", desc("created_at"), desc("id")),
    )

    @staticmethod
    def _detail(row: WalletEntryLogTable) -> EntryLogDetail:
        return {
            "id": str(row.id),
            "entry_id": str(row.entry_id),
            "action": EntryLogAction(row.action),
            "actor_id": str(row.actor_id),
            "as_super_admin": row.as_super_admin,
            "before": row.before,
            "after": row.after,
            "created_at": row.created_at,
        }

    @classmethod
    async def list_for_entry(cls, wallet_id: str, entry_id: str) -> list[EntryLogDetail]:
        """一筆帳的歷史, 新到舊。一筆帳的紀錄不多, 不分頁。"""
        wallet_uuid, entry_uuid = parse_uuid(wallet_id), parse_uuid(entry_id)
        if wallet_uuid is None or entry_uuid is None:
            return []
        rows = await resolve_session(None).scalars(
            select(cls)
            .where(cls.wallet_id == wallet_uuid, cls.entry_id == entry_uuid)
            .order_by(cls.created_at.desc(), cls.id.desc())
        )
        return [cls._detail(row) for row in rows]

    @classmethod
    async def find_page(
        cls, wallet_id: str, limit: int, cursor: str | None = None
    ) -> EntryLogPageResult:
        """整個錢包的紀錄, 新到舊, 只往下一頁。不用 `get_page` 的理由同帳目: 它只會由舊到新。"""
        keys = (cls.created_at, cls.id)
        statement = select(cls).where(cls.wallet_id == parse_uuid(wallet_id))
        if cursor is not None:
            created_at, row_id = _decode_keys(cursor, 2)
            try:
                after = (datetime.fromisoformat(created_at), uuid.UUID(row_id))
            except ValueError as exc:
                raise LangException(400, PaginationError.INVALID_CURSOR) from exc
            statement = statement.where(tuple_(*keys) < tuple_(*after))
        statement = statement.order_by(*(key.desc() for key in keys)).limit(limit + 1)
        rows = list(await resolve_session(None).scalars(statement))
        last = rows[limit - 1] if len(rows) > limit else None
        return {
            "list_data": [cls._detail(row) for row in rows[:limit]],
            "next_cursor": None if last is None else _encode_keys(last.created_at, last.id),
        }
