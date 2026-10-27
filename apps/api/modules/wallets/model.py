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
    ForeignKeyConstraint,
    Index,
    Integer,
    Select,
    SmallInteger,
    String,
    UniqueConstraint,
    delete,
    desc,
    false,
    func,
    select,
    text,
    tuple_,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, aliased, mapped_column

from shared.db.query import ilike_contains
from shared.db.session import resolve_session
from shared.db.table import BaseTable, Condition, PagedResult, PaginationError, parse_uuid
from shared.http.errors import LangException
from shared.time import utc_now


class WalletKind(StrEnum):
    """錢包的類型, 建立後不能改。"""

    GENERAL = "general"
    TRAVEL = "travel"


class WalletStatus(StrEnum):
    """錢包的生命週期。只有旅遊錢包會離開 `active`
    (見 docs/features/travel-wallet.md〈結算流程〉)。
    """

    ACTIVE = "active"
    SETTLING = "settling"
    SETTLED = "settled"


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
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"
    ADVANCE = "advance"
    REPAYMENT = "repayment"


#: 轉帳的兩邊。一筆轉帳在兩個錢包各有一筆帳, 以 `transfer_id` 連在一起。
TRANSFER_KINDS = frozenset({EntryKind.TRANSFER_OUT, EntryKind.TRANSFER_IN})

#: 代墊與它的還款。還款以 `advance_id` 指向那一筆代墊。
ADVANCE_KINDS = frozenset({EntryKind.ADVANCE, EntryKind.REPAYMENT})


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
    status: WalletStatus
    balance: int
    destination: str | None
    start_date: date | None
    end_date: date | None
    created_at: datetime


class JoinedWallet(TypedDict):
    wallet: WalletDetail
    role: MemberRole
    is_favorite: bool
    group_id: str
    is_hidden: bool


class Placement(TypedDict):
    """自己把這個錢包放在哪個群組、要不要顯示。"""

    group_id: str
    is_hidden: bool


class GroupDetail(TypedDict):
    id: str
    user_id: str
    kind: WalletKind
    #: 預設群組沒有名稱, 由前端依語系顯示。
    name: str | None
    is_default: bool
    position: int


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
    # 存字串的理由同 `kind`。
    status: Mapped[str] = mapped_column(String, default=WalletStatus.ACTIVE)
    # 餘額是存起來的值 (記帳時當下更新), 不是顯示時才從明細加總,
    # 見 docs/features/general-wallet.md〈餘額〉。
    # 旅遊錢包沒有餘額, 但仍是 0 而不是 NULL: 列表的加總只看一般錢包, 不必處理 NULL。
    balance: Mapped[int] = mapped_column(BigInteger, default=0)
    destination: Mapped[str | None] = mapped_column(String, default=None)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)

    __table_args__ = (
        CheckConstraint("kind IN ('general', 'travel')", name="kind"),
        CheckConstraint("status IN ('active', 'settling', 'settled')", name="status"),
        CheckConstraint("kind = 'travel' OR status = 'active'", name="only_travel_settles"),
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
    async def lock_status(cls, id: str) -> WalletStatus | None:
        """鎖住錢包這一列並讀出目前的狀態; 錢包不存在時是 None。

        旅遊錢包的記帳與結算都先經過這裡: 開始結算的同時有人記帳, 不鎖的話那一筆會在
        方案算完之後才寫進去, 帳目就跟方案對不上了。只選欄位的理由同 `lock_balance`。
        """
        row_id = parse_uuid(id)
        if row_id is None:
            return None
        status = await resolve_session(None).scalar(
            select(cls.status).where(cls.id == row_id).with_for_update()
        )
        return None if status is None else WalletStatus(status)

    @classmethod
    async def set_status(cls, id: str, status: WalletStatus) -> None:
        """只在 `lock_status` 之後呼叫, 理由見那裡。"""
        await resolve_session(None).execute(
            update(cls).where(cls.id == parse_uuid(id)).values(status=status, updated_at=utc_now())
        )

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
            select(
                cls,
                WalletMemberTable.role,
                WalletMemberTable.is_favorite,
                WalletMemberTable.group_id,
                WalletMemberTable.is_hidden,
            )
            .join(WalletMemberTable, WalletMemberTable.wallet_id == cls.id)
            .where(WalletMemberTable.user_id == row_id)
            .order_by(WalletMemberTable.created_at.asc(), cls.id.asc())
        )
        rows = (await resolve_session(None).execute(statement)).all()
        return [
            {
                "wallet": cast(WalletDetail, wallet.to_detail()),
                "role": MemberRole(role),
                "is_favorite": is_favorite,
                "group_id": str(group_id),
                "is_hidden": is_hidden,
            }
            for wallet, role, is_favorite, group_id, is_hidden in rows
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
        (見 docs/features/wallets.md〈刪除錢包〉), 留著列只會讓每個查詢都要記得過濾。
        """
        row_id = parse_uuid(id)
        if row_id is None:
            return False
        result = await resolve_session(None).execute(
            delete(cls).where(cls.id == row_id).returning(cls.id)
        )
        return result.first() is not None


class WalletGroupTable(BaseTable):
    """每個人自己的錢包群組 (見 docs/features/wallets.md〈錢包群組〉)。

    預設群組也是一列: 錢包一定要屬於某個群組, 而且預設群組跟自訂群組一起排序。
    """

    __tablename__ = "wallet_groups"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 存字串的理由同 `WalletTable.kind`。
    kind: Mapped[str] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String, default=None)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # 同一個人、同一種類型裡的順序。不設唯一: 交換兩個群組的位置時, 中間會有兩列同一個值。
    position: Mapped[int] = mapped_column(Integer)

    __table_args__ = (
        CheckConstraint("kind IN ('general', 'travel')", name="kind"),
        # 預設群組的名稱跟著語系, 存了名字就會跟畫面上顯示的對不上。
        CheckConstraint("is_default = (name IS NULL)", name="default_has_no_name"),
        # 成員紀錄用 (group_id, user_id) 參照這裡, 擋住把錢包放進別人的群組。
        UniqueConstraint("id", "user_id"),
        Index(
            "uq_wallet_groups_default",
            "user_id",
            "kind",
            unique=True,
            postgresql_where="is_default",
        ),
        # service 會先查一次給出好讀的錯誤, 這個索引擋的是兩個請求同時新增。
        Index(
            "uq_wallet_groups_name",
            "user_id",
            "kind",
            "name",
            unique=True,
            postgresql_where="NOT is_default",
        ),
    )

    @staticmethod
    def _detail(row: WalletGroupTable) -> GroupDetail:
        return {
            "id": str(row.id),
            "user_id": str(row.user_id),
            "kind": WalletKind(row.kind),
            "name": row.name,
            "is_default": row.is_default,
            "position": row.position,
        }

    @classmethod
    async def ensure_defaults(cls, user_id: str) -> None:
        """兩種類型各補一個預設群組, 已經有就不動。

        第一次用到群組時才建, 而不是建立帳號時: 帳號有註冊、後台、CLI 三個入口, 都屬於
        users 模組。用 `ON CONFLICT DO NOTHING` 的理由同 `WalletMemberTable.add_if_absent`。
        """
        row_user = parse_uuid(user_id)
        if row_user is None:
            return
        now = utc_now()
        await resolve_session(None).execute(
            pg_insert(cls)
            .values(
                [
                    {
                        "id": uuid.uuid4(),
                        "created_at": now,
                        "user_id": row_user,
                        "kind": kind,
                        "name": None,
                        "is_default": True,
                        "position": 0,
                    }
                    for kind in WalletKind
                ]
            )
            .on_conflict_do_nothing(
                # 要跟索引的 WHERE 寫得一模一樣: 寫成 `is_default IS true`
                # PostgreSQL 就認不出是同一個索引。
                index_elements=["user_id", "kind"],
                index_where=text("is_default"),
            )
        )

    @classmethod
    async def list_for_user(cls, user_id: str, lock: bool = False) -> list[GroupDetail]:
        """一般群組在前, 同類型裡依位置排列。

        `lock` 鎖住這個人所有的群組直到交易結束: 新增、刪除、移動都是先讀出順序再整批改寫,
        兩個請求同時做的話, 後寫的會蓋掉前一個重新編好的位置。
        """
        row_user = parse_uuid(user_id)
        if row_user is None:
            return []
        statement = (
            select(cls)
            .where(cls.user_id == row_user)
            .order_by(cls.kind.asc(), cls.position.asc(), cls.created_at.asc(), cls.id.asc())
        )
        if lock:
            statement = statement.with_for_update()
        rows = (await resolve_session(None).scalars(statement)).all()
        return [cls._detail(row) for row in rows]

    @classmethod
    async def find_default_id(cls, user_id: str, kind: WalletKind) -> str | None:
        row_user = parse_uuid(user_id)
        if row_user is None:
            return None
        found = await resolve_session(None).scalar(
            select(cls.id).where(cls.user_id == row_user, cls.kind == kind, cls.is_default)
        )
        return None if found is None else str(found)

    @classmethod
    async def name_taken(
        cls, user_id: str, kind: WalletKind, name: str, exclude_id: str | None = None
    ) -> bool:
        conditions = [
            cls.user_id == parse_uuid(user_id),
            cls.kind == kind,
            cls.name == name,
        ]
        if exclude_id is not None:
            conditions.append(cls.id != parse_uuid(exclude_id))
        found = await resolve_session(None).scalar(select(cls.id).where(*conditions).limit(1))
        return found is not None

    @classmethod
    async def set_positions(cls, positions: dict[str, int]) -> None:
        """只在 `list_for_user(lock=True)` 之後呼叫, 理由見那裡。"""
        db = resolve_session(None)
        for id, position in positions.items():
            await db.execute(update(cls).where(cls.id == parse_uuid(id)).values(position=position))

    @classmethod
    async def remove(cls, id: str) -> None:
        """裡面的錢包要先移走 (`WalletMemberTable.move_group`), 否則成員紀錄的外鍵會擋下。"""
        await resolve_session(None).execute(delete(cls).where(cls.id == parse_uuid(id)))


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
    # 最愛是每個人自己的標記 (見 docs/features/wallets.md〈錢包列表〉),
    # 所以放在成員紀錄而不是錢包上;
    # 離開錢包時跟著成員紀錄一起消失。
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # 群組與顯示也是每個人自己的設定, 理由同 `is_favorite`。
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    __table_args__ = (
        UniqueConstraint("wallet_id", "user_id"),
        CheckConstraint("role IN ('admin', 'member')", name="role"),
        # 連同 user_id 一起參照: 群組一定是這位成員自己的。不設 ON DELETE: 刪除群組前
        # service 會把裡面的錢包移回預設群組, 漏了就該被擋下, 而不是讓錢包跟著消失。
        ForeignKeyConstraint(
            ["group_id", "user_id"], ["wallet_groups.id", "wallet_groups.user_id"]
        ),
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
    async def find_favorite(cls, wallet_id: str, user_id: str) -> bool:
        """不是成員時是 False。"""
        if parse_uuid(wallet_id) is None or parse_uuid(user_id) is None:
            return False
        value = await resolve_session(None).scalar(
            select(cls.is_favorite).where(*cls._key(wallet_id, user_id))
        )
        return bool(value)

    @classmethod
    async def set_favorite(cls, wallet_id: str, user_id: str, value: bool) -> None:
        # 不動 `updated_at`: 最愛是個人的顯示偏好, 不算錢包成員資料的變更。
        await resolve_session(None).execute(
            update(cls).where(*cls._key(wallet_id, user_id)).values(is_favorite=value)
        )

    @classmethod
    async def find_placement(cls, wallet_id: str, user_id: str) -> Placement | None:
        """不是成員時是 None。"""
        if parse_uuid(wallet_id) is None or parse_uuid(user_id) is None:
            return None
        row = (
            await resolve_session(None).execute(
                select(cls.group_id, cls.is_hidden).where(*cls._key(wallet_id, user_id))
            )
        ).first()
        return None if row is None else {"group_id": str(row[0]), "is_hidden": row[1]}

    # 群組與顯示都不動 `updated_at`, 理由同 `set_favorite`。
    @classmethod
    async def set_group(cls, wallet_id: str, user_id: str, group_id: str) -> None:
        await resolve_session(None).execute(
            update(cls).where(*cls._key(wallet_id, user_id)).values(group_id=parse_uuid(group_id))
        )

    @classmethod
    async def set_hidden(cls, wallet_id: str, user_id: str, value: bool) -> None:
        await resolve_session(None).execute(
            update(cls).where(*cls._key(wallet_id, user_id)).values(is_hidden=value)
        )

    @classmethod
    async def move_group(cls, from_group_id: str, to_group_id: str) -> None:
        """把一個群組裡的錢包整批搬到另一個群組 (刪除群組前)。"""
        await resolve_session(None).execute(
            update(cls)
            .where(cls.group_id == parse_uuid(from_group_id))
            .values(group_id=parse_uuid(to_group_id))
        )

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
    async def add_if_absent(
        cls, wallet_id: str, user_id: str, role: MemberRole, group_id: str
    ) -> None:
        """已經是成員時什麼都不做 (角色、群組都不變)。

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
                group_id=parse_uuid(group_id),
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
    # 刪除分類是封存 (見 docs/features/general-wallet.md〈分類〉): 帳目引用著它,
    # 舊帳要照樣顯示原本的名稱。
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
    # 存原文而不是雜湊: 有效期內管理者要能再看到同一條連結
    # (見 docs/features/members.md〈邀請連結〉)。
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


class AdvanceTargetDetail(TypedDict):
    id: str
    name: str
    #: 這個對象各筆代墊未還金額的總和。
    outstanding: int


class WalletAdvanceTargetTable(BaseTable):
    """代墊的對象。不是成員, 只是名字 (見 docs/features/general-wallet.md〈代墊與還款〉)。

    未還金額存在這裡而不是查詢時加總各筆代墊: 錢包頁每次都要顯示未還清單。
    名字用過一次就留著 (未還為 0 也是), 記代墊時當作輸入提示。
    """

    __tablename__ = "wallet_advance_targets"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    name: Mapped[str]
    outstanding: Mapped[int] = mapped_column(BigInteger, default=0)

    __table_args__ = (
        UniqueConstraint("wallet_id", "name"),
        CheckConstraint("outstanding >= 0", name="outstanding_not_negative"),
    )

    @staticmethod
    def _detail(row: WalletAdvanceTargetTable) -> AdvanceTargetDetail:
        return {"id": str(row.id), "name": row.name, "outstanding": row.outstanding}

    @classmethod
    async def find_or_create(cls, wallet_id: str, name: str) -> AdvanceTargetDetail:
        """依名字找, 沒有就建立。名字比對大小寫視為不同, 去空白由 schema 做。"""
        wallet_uuid = parse_uuid(wallet_id)
        db = resolve_session(None)
        await db.execute(
            pg_insert(cls)
            .values(id=uuid.uuid4(), created_at=utc_now(), wallet_id=wallet_uuid, name=name)
            .on_conflict_do_nothing(index_elements=["wallet_id", "name"])
        )
        row = await db.scalar(select(cls).where(cls.wallet_id == wallet_uuid, cls.name == name))
        return cls._detail(cast(WalletAdvanceTargetTable, row))

    @classmethod
    async def add_outstanding(cls, id: str, delta: int) -> int:
        """加上差額並回傳新的未還金額。"""
        result = await resolve_session(None).scalar(
            update(cls)
            .where(cls.id == parse_uuid(id))
            .values(outstanding=cls.outstanding + delta, updated_at=utc_now())
            .returning(cls.outstanding)
        )
        return cast(int, result)

    @classmethod
    async def list_in_wallet(cls, wallet_id: str) -> list[AdvanceTargetDetail]:
        """依名字排序, 含未還為 0 的。"""
        wallet_uuid = parse_uuid(wallet_id)
        if wallet_uuid is None:
            return []
        rows = await resolve_session(None).scalars(
            select(cls).where(cls.wallet_id == wallet_uuid).order_by(cls.name)
        )
        return [cls._detail(row) for row in rows]


class EntryDetail(TypedDict):
    id: str
    wallet_id: str
    kind: EntryKind
    #: 收入、支出與轉帳是正數; 調整是差額, 可以是負的。
    amount: int
    category_id: str | None
    #: 分類目前的名稱 (含已封存的); 只有收入與支出有分類。
    category_name: str | None
    #: 轉帳的兩筆共用的 id; 不是轉帳時是 None。
    transfer_id: str | None
    #: 轉帳的對方錢包; 不是轉帳, 或對方錢包已刪除時是 None。
    counterpart_wallet_id: str | None
    counterpart_wallet_name: str | None
    #: 代墊與還款的對象; 其他種類是 None。
    advance_target_id: str | None
    advance_target_name: str | None
    #: 還款對的那一筆代墊; 不是還款時是 None。
    advance_id: str | None
    #: 代墊還沒還的金額; 不是代墊時是 None。
    outstanding: int | None
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


def _optional_id(value: uuid.UUID | None) -> str | None:
    return None if value is None else str(value)


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
    # 轉帳的兩筆共用同一個值, 不設外鍵: 兩筆是對等的, 沒有哪一筆是另一筆的父。
    transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), default=None, index=True
    )
    # 對方錢包被刪除時設成 NULL 而不是連帶刪掉這一筆: 別人刪掉自己的錢包, 不該改到這個錢包的
    # 帳與餘額 (見 docs/features/general-wallet.md〈轉帳〉)。
    counterpart_wallet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="SET NULL"), default=None
    )
    # 代墊與還款的對象。對象只會隨錢包一起刪掉, 所以外鍵不設 ON DELETE。
    advance_target_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_advance_targets.id"), default=None
    )
    # 還款指向它的代墊。不設 ON DELETE: 有還款的代墊不能刪
    # (見 docs/features/general-wallet.md〈代墊與還款〉),
    # 外鍵替 service 的檢查再擋一次。
    advance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_entries.id"), default=None, index=True
    )
    # 代墊還沒還的金額, 存起來的值: 還款的上限要在上鎖後直接讀, 不從還款加總。
    outstanding: Mapped[int | None] = mapped_column(BigInteger, default=None)
    # 指向使用者而不是成員紀錄: 記帳人離開錢包後帳目照樣保留
    # (見 docs/features/members.md〈離開與移除〉)。
    # 不設 ON DELETE: 使用者只會被停用, 不會被刪除。
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    __table_args__ = (
        CheckConstraint(
            "kind IN ('income', 'expense', 'adjustment', 'transfer_out', 'transfer_in',"
            " 'advance', 'repayment')",
            name="kind",
        ),
        # 只有調整的差額可以是負的 (見 docs/features/amounts.md)。
        CheckConstraint(
            "(kind = 'adjustment' AND amount <> 0) OR (kind <> 'adjustment' AND amount > 0)",
            name="amount",
        ),
        CheckConstraint(
            "(kind IN ('income', 'expense')) = (category_id IS NOT NULL)",
            name="category_only_for_income_expense",
        ),
        CheckConstraint(
            "(kind IN ('transfer_out', 'transfer_in')) = (transfer_id IS NOT NULL)",
            name="transfer_id_only_for_transfer",
        ),
        CheckConstraint(
            "counterpart_wallet_id IS NULL OR kind IN ('transfer_out', 'transfer_in')",
            name="counterpart_only_for_transfer",
        ),
        CheckConstraint(
            "(kind IN ('advance', 'repayment')) = (advance_target_id IS NOT NULL)",
            name="target_only_for_advance",
        ),
        CheckConstraint("(kind = 'repayment') = (advance_id IS NOT NULL)", name="advance_id"),
        CheckConstraint(
            "(kind = 'advance') = (outstanding IS NOT NULL)"
            " AND (outstanding IS NULL OR outstanding BETWEEN 0 AND amount)",
            name="outstanding",
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
        counterpart = aliased(WalletTable)
        target = WalletAdvanceTargetTable
        return (
            select(cls, WalletCategoryTable.name, counterpart.name, target.name)
            .outerjoin(WalletCategoryTable, WalletCategoryTable.id == cls.category_id)
            .outerjoin(counterpart, counterpart.id == cls.counterpart_wallet_id)
            .outerjoin(target, target.id == cls.advance_target_id)
        )

    @staticmethod
    def _detail(
        row: WalletEntryTable,
        category_name: str | None,
        counterpart_name: str | None,
        target_name: str | None,
    ) -> EntryDetail:
        return {
            "id": str(row.id),
            "wallet_id": str(row.wallet_id),
            "kind": EntryKind(row.kind),
            "amount": row.amount,
            "category_id": None if row.category_id is None else str(row.category_id),
            "category_name": category_name,
            "entry_date": row.entry_date,
            "note": row.note,
            "transfer_id": None if row.transfer_id is None else str(row.transfer_id),
            "counterpart_wallet_id": (
                None if row.counterpart_wallet_id is None else str(row.counterpart_wallet_id)
            ),
            "counterpart_wallet_name": counterpart_name,
            "advance_target_id": _optional_id(row.advance_target_id),
            "advance_target_name": target_name,
            "advance_id": _optional_id(row.advance_id),
            "outstanding": row.outstanding,
            "created_by": str(row.created_by),
            "created_at": row.created_at,
        }

    @classmethod
    async def find_counterpart_wallet_id(cls, wallet_id: str, id: str) -> str | None:
        """轉帳的對方錢包; 不是轉帳、對方已刪除或帳不存在時是 None。

        改刪轉帳要先知道鎖哪兩個錢包, 所以在上鎖之前查。只選欄位, 不把帳目載進 session:
        鎖好之後 `find_detail_in_wallet` 才是第一次載入, 讀到的是鎖之後的值
        (理由同 `lock_balance`)。
        """
        wallet_uuid, row_id = parse_uuid(wallet_id), parse_uuid(id)
        if wallet_uuid is None or row_id is None:
            return None
        found = await resolve_session(None).scalar(
            select(cls.counterpart_wallet_id).where(cls.id == row_id, cls.wallet_id == wallet_uuid)
        )
        return None if found is None else str(found)

    @classmethod
    async def find_transfer_in_wallet(cls, wallet_id: str, transfer_id: str) -> EntryDetail | None:
        """一筆轉帳在某個錢包的那一邊。"""
        wallet_uuid, transfer_uuid = parse_uuid(wallet_id), parse_uuid(transfer_id)
        if wallet_uuid is None or transfer_uuid is None:
            return None
        statement = cls._detail_select().where(
            cls.transfer_id == transfer_uuid, cls.wallet_id == wallet_uuid
        )
        found = (await resolve_session(None).execute(statement)).first()
        return None if found is None else cls._detail(*found)

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
        page = [cls._detail(*row) for row in rows[:limit]]
        last = rows[limit - 1][0] if len(rows) > limit else None
        next_cursor = (
            None if last is None else _encode_keys(last.entry_date, last.created_at, last.id)
        )
        return {"list_data": page, "next_cursor": next_cursor}

    @classmethod
    async def list_repayments(cls, wallet_id: str, advance_id: str) -> list[EntryDetail]:
        """一筆代墊的還款, 排序同帳目列表。一筆代墊的還款不多, 不分頁。"""
        wallet_uuid, advance_uuid = parse_uuid(wallet_id), parse_uuid(advance_id)
        if wallet_uuid is None or advance_uuid is None:
            return []
        statement = (
            cls._detail_select()
            .where(cls.wallet_id == wallet_uuid, cls.advance_id == advance_uuid)
            .order_by(cls.entry_date.desc(), cls.created_at.desc(), cls.id.desc())
        )
        return [cls._detail(*row) for row in (await resolve_session(None).execute(statement)).all()]

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


class SplitMode(StrEnum):
    """旅遊錢包一筆帳的分攤方式。"""

    EQUAL = "equal"
    CUSTOM = "custom"


class ShareDetail(TypedDict):
    user_id: str
    #: 均分時可以是 0 (金額少於人數), 指定金額時一定大於 0。
    amount: int


class ExpenseDetail(TypedDict):
    id: str
    wallet_id: str
    amount: int
    payer_id: str
    split_mode: SplitMode
    #: 依存進來的順序: 均分是加入錢包的順序, 指定金額是表上的順序。
    shares: list[ShareDetail]
    entry_date: date
    note: str
    created_by: str
    created_at: datetime


class ExpensePageResult(TypedDict):
    list_data: list[ExpenseDetail]
    next_cursor: str | None


class MemberTotals(TypedDict):
    #: 這個人付的總額。
    paid: int
    #: 這個人分攤的總額。
    owed: int


class TravelExpenseTable(BaseTable):
    """旅遊錢包的一筆帳: 誰付了多少, 每人分攤多少 (`TravelExpenseShareTable`)。

    不放進 `wallet_entries`: 那張表的每個欄位與約束都是為餘額設計的 (分類、轉帳、代墊),
    旅遊錢包沒有餘額, 而它要的付款人與每人分攤在那裡都沒有位置。
    """

    __tablename__ = "travel_expenses"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    amount: Mapped[int] = mapped_column(BigInteger)
    # 指向使用者而不是成員紀錄, 理由同 `WalletEntryTable.created_by`; 有紀錄的人不能離開
    # (見 docs/features/travel-wallet.md〈成員異動〉), 所以付款人一定還是成員。
    payer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    # 存字串的理由同 `WalletTable.kind`。
    split_mode: Mapped[str] = mapped_column(String)
    entry_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String, default="")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("split_mode IN ('equal', 'custom')", name="split_mode"),
        # 錢包頁的列表, 排序同 `WalletEntryTable`。
        Index(
            "ix_travel_expenses_wallet_list",
            "wallet_id",
            desc("entry_date"),
            desc("created_at"),
            desc("id"),
        ),
        # 「這個人有沒有付過錢」(移除成員前) 與每人付款的加總。
        Index("ix_travel_expenses_wallet_payer", "wallet_id", "payer_id"),
    )

    @staticmethod
    def _detail(row: TravelExpenseTable, shares: list[ShareDetail]) -> ExpenseDetail:
        return {
            "id": str(row.id),
            "wallet_id": str(row.wallet_id),
            "amount": row.amount,
            "payer_id": str(row.payer_id),
            "split_mode": SplitMode(row.split_mode),
            "shares": shares,
            "entry_date": row.entry_date,
            "note": row.note,
            "created_by": str(row.created_by),
            "created_at": row.created_at,
        }

    @classmethod
    async def _with_shares(cls, rows: list[TravelExpenseTable]) -> list[ExpenseDetail]:
        """一次查完這些帳的分攤 (列表的一頁), 不逐筆查。"""
        share = TravelExpenseShareTable
        by_expense: dict[uuid.UUID, list[ShareDetail]] = {row.id: [] for row in rows}
        if rows:
            share_rows = await resolve_session(None).execute(
                select(share.expense_id, share.user_id, share.amount)
                .where(share.expense_id.in_(list(by_expense)))
                .order_by(share.expense_id, share.position)
            )
            for expense_id, user_id, amount in share_rows.all():
                by_expense[expense_id].append({"user_id": str(user_id), "amount": amount})
        return [cls._detail(row, by_expense[row.id]) for row in rows]

    @classmethod
    async def create_with_shares(cls, data: dict, shares: list[ShareDetail]) -> str:
        created = await cls.create(data=data)
        await TravelExpenseShareTable.add_many(created["id"], shares)
        return created["id"]

    @classmethod
    async def find_detail_in_wallet(cls, wallet_id: str, id: str) -> ExpenseDetail | None:
        """只找這個錢包裡的帳, 理由同 `WalletEntryTable.find_detail_in_wallet`。

        只選欄位、每次都重新讀, 不從 session 的 identity map 拿: 修改後同一個請求再讀時
        要讀到新的值 (理由同 `WalletTable.lock_balance`)。
        """
        wallet_uuid, row_id = parse_uuid(wallet_id), parse_uuid(id)
        if wallet_uuid is None or row_id is None:
            return None
        row = await resolve_session(None).scalar(
            select(cls)
            .where(cls.id == row_id, cls.wallet_id == wallet_uuid)
            .execution_options(populate_existing=True)
        )
        return None if row is None else (await cls._with_shares([row]))[0]

    @classmethod
    async def replace_in_wallet(
        cls, wallet_id: str, id: str, data: dict, shares: list[ShareDetail]
    ) -> None:
        """改欄位並整組換掉分攤。分攤不逐列比對: 一筆帳的分攤只有幾列, 整組換最單純。"""
        row_id = parse_uuid(id)
        db = resolve_session(None)
        await db.execute(
            update(cls)
            .where(cls.id == row_id, cls.wallet_id == parse_uuid(wallet_id))
            .values(**cls._coerce(data), updated_at=utc_now())
        )
        await db.execute(
            delete(TravelExpenseShareTable).where(TravelExpenseShareTable.expense_id == row_id)
        )
        await TravelExpenseShareTable.add_many(id, shares)

    @classmethod
    async def delete_in_wallet(cls, wallet_id: str, id: str) -> None:
        """分攤由外鍵的 `ON DELETE CASCADE` 一起刪掉。"""
        await resolve_session(None).execute(
            delete(cls).where(cls.id == parse_uuid(id), cls.wallet_id == parse_uuid(wallet_id))
        )

    @classmethod
    async def find_page(
        cls, wallet_id: str, limit: int, cursor: str | None = None
    ) -> ExpensePageResult:
        """排序與游標同 `WalletEntryTable.find_page`。"""
        keys = (cls.entry_date, cls.created_at, cls.id)
        statement = select(cls).where(cls.wallet_id == parse_uuid(wallet_id))
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
        rows = list(await resolve_session(None).scalars(statement))
        last = rows[limit - 1] if len(rows) > limit else None
        next_cursor = (
            None if last is None else _encode_keys(last.entry_date, last.created_at, last.id)
        )
        return {"list_data": await cls._with_shares(rows[:limit]), "next_cursor": next_cursor}

    @classmethod
    async def totals(cls, wallet_id: str) -> dict[str, MemberTotals]:
        """每人付的與分攤的總額, 只列有紀錄的人。查詢時加總而不存起來: 旅遊錢包的帳不多。"""
        wallet_uuid = parse_uuid(wallet_id)
        if wallet_uuid is None:
            return {}
        db = resolve_session(None)
        share = TravelExpenseShareTable
        paid = await db.execute(
            select(cls.payer_id, func.sum(cls.amount))
            .where(cls.wallet_id == wallet_uuid)
            .group_by(cls.payer_id)
        )
        owed = await db.execute(
            select(share.user_id, func.sum(share.amount))
            .join(cls, cls.id == share.expense_id)
            .where(cls.wallet_id == wallet_uuid)
            .group_by(share.user_id)
        )
        result: dict[str, MemberTotals] = {}
        for user_id, total in paid.all():
            result.setdefault(str(user_id), {"paid": 0, "owed": 0})["paid"] = int(total)
        for user_id, total in owed.all():
            result.setdefault(str(user_id), {"paid": 0, "owed": 0})["owed"] = int(total)
        return result

    @classmethod
    async def has_records(cls, wallet_id: str, user_id: str) -> bool:
        """這個人在這個錢包有沒有付款或分攤紀錄 (分到 0 也算)。"""
        wallet_uuid, user_uuid = parse_uuid(wallet_id), parse_uuid(user_id)
        if wallet_uuid is None or user_uuid is None:
            return False
        share = TravelExpenseShareTable
        in_wallet = cls.wallet_id == wallet_uuid
        paid = select(cls.id).where(in_wallet, cls.payer_id == user_uuid)
        shared = (
            select(share.id)
            .join(cls, cls.id == share.expense_id)
            .where(in_wallet, share.user_id == user_uuid)
        )
        found = await resolve_session(None).scalar(
            select(func.count()).select_from(paid.union_all(shared).limit(1).subquery())
        )
        return bool(found)


class TravelExpenseShareTable(BaseTable):
    """一筆旅遊錢包的帳裡一個人分攤的金額。均分也存成每人的金額, 淨額直接加總。"""

    __tablename__ = "travel_expense_shares"

    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("travel_expenses.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger)
    # 存順序而不是靠 created_at: 同一批寫入的時間相同, 指定金額的表要照使用者排的順序顯示。
    position: Mapped[int] = mapped_column(SmallInteger)

    __table_args__ = (
        UniqueConstraint("expense_id", "user_id"),
        CheckConstraint("amount >= 0", name="amount_not_negative"),
    )

    @classmethod
    async def add_many(cls, expense_id: str, shares: list[ShareDetail]) -> None:
        db = resolve_session(None)
        for position, share in enumerate(shares):
            db.add(
                cls(
                    expense_id=parse_uuid(expense_id),
                    user_id=parse_uuid(share["user_id"]),
                    amount=share["amount"],
                    position=position,
                )
            )
        await db.flush()


class PlannedTransfer(TypedDict):
    """清償方案的一筆: 誰付給誰多少。"""

    from_user_id: str
    to_user_id: str
    amount: int


class SettlementTransferDetail(TypedDict):
    id: str
    wallet_id: str
    from_user_id: str
    to_user_id: str
    amount: int
    paid_at: datetime | None
    confirmed_at: datetime | None
    confirmed_by: str | None


class TravelSettlementTransferTable(BaseTable):
    """清償方案的一筆轉帳, 以及它的付款與確認 (見 docs/features/travel-wallet.md〈結算流程〉)。

    方案在開始結算時算好整份存進來, 結算中不重算: 帳目鎖住了, 重算只會得到同樣的結果,
    而存下來才能逐筆記付款與確認。取消結算時整份刪掉, 不留作廢的列: 規格說作廢,
    之後也沒有地方要看它。
    """

    __tablename__ = "travel_settlement_transfers"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE")
    )
    # 指向使用者而不是成員紀錄: 封存後有紀錄的人可以離開, 方案上照樣要顯示他。
    from_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    amount: Mapped[int] = mapped_column(BigInteger)
    # 存順序的理由同 `TravelExpenseShareTable.position`。
    position: Mapped[int] = mapped_column(SmallInteger)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), default=None
    )

    __table_args__ = (
        UniqueConstraint("wallet_id", "position"),
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("(confirmed_at IS NULL) = (confirmed_by IS NULL)", name="confirmed_pair"),
    )

    @staticmethod
    def _detail(row: TravelSettlementTransferTable) -> SettlementTransferDetail:
        return {
            "id": str(row.id),
            "wallet_id": str(row.wallet_id),
            "from_user_id": str(row.from_user_id),
            "to_user_id": str(row.to_user_id),
            "amount": row.amount,
            "paid_at": row.paid_at,
            "confirmed_at": row.confirmed_at,
            "confirmed_by": _optional_id(row.confirmed_by),
        }

    @classmethod
    async def create_plan(cls, wallet_id: str, transfers: list[PlannedTransfer]) -> None:
        db = resolve_session(None)
        for position, transfer in enumerate(transfers):
            db.add(
                cls(
                    wallet_id=parse_uuid(wallet_id),
                    from_user_id=parse_uuid(transfer["from_user_id"]),
                    to_user_id=parse_uuid(transfer["to_user_id"]),
                    amount=transfer["amount"],
                    position=position,
                )
            )
        await db.flush()

    @classmethod
    async def delete_in_wallet(cls, wallet_id: str) -> None:
        await resolve_session(None).execute(
            delete(cls).where(cls.wallet_id == parse_uuid(wallet_id))
        )

    @classmethod
    async def list_in_wallet(cls, wallet_id: str) -> list[SettlementTransferDetail]:
        """依方案的順序。重新讀而不從 identity map 拿, 理由同 `TravelExpenseTable`。"""
        wallet_uuid = parse_uuid(wallet_id)
        if wallet_uuid is None:
            return []
        rows = await resolve_session(None).scalars(
            select(cls)
            .where(cls.wallet_id == wallet_uuid)
            .order_by(cls.position)
            .execution_options(populate_existing=True)
        )
        return [cls._detail(row) for row in rows]

    @classmethod
    async def find_detail_in_wallet(
        cls, wallet_id: str, id: str
    ) -> SettlementTransferDetail | None:
        wallet_uuid, row_id = parse_uuid(wallet_id), parse_uuid(id)
        if wallet_uuid is None or row_id is None:
            return None
        row = await resolve_session(None).scalar(
            select(cls)
            .where(cls.id == row_id, cls.wallet_id == wallet_uuid)
            .execution_options(populate_existing=True)
        )
        return None if row is None else cls._detail(row)

    @classmethod
    async def set_paid(cls, id: str, paid_at: datetime | None) -> None:
        await resolve_session(None).execute(
            update(cls)
            .where(cls.id == parse_uuid(id))
            .values(paid_at=paid_at, updated_at=utc_now())
        )

    @classmethod
    async def set_confirmed(
        cls, id: str, confirmed_by: str | None, confirmed_at: datetime | None
    ) -> None:
        await resolve_session(None).execute(
            update(cls)
            .where(cls.id == parse_uuid(id))
            .values(
                confirmed_by=None if confirmed_by is None else parse_uuid(confirmed_by),
                confirmed_at=confirmed_at,
                updated_at=utc_now(),
            )
        )

    @classmethod
    async def count_unconfirmed(cls, wallet_id: str) -> int:
        count = await resolve_session(None).scalar(
            select(func.count())
            .select_from(cls)
            .where(cls.wallet_id == parse_uuid(wallet_id), cls.confirmed_at.is_(None))
        )
        return count or 0
