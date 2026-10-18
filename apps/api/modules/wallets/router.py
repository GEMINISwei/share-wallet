from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.permissions import Permission
from shared.auth.contracts import CurrentUser
from shared.auth.dependency import check_user_permission
from shared.http.schema import PaginationParams

from . import admin, categories, entries, entry_logs, invites, members, service
from .model import WalletKind
from .schema import (
    AdminWalletCreate,
    AdminWalletList,
    BalanceAdjust,
    CategoryCreate,
    CategoryList,
    CategoryOperate,
    CategoryRename,
    EntryCreate,
    EntryLogList,
    EntryLogPage,
    EntryOperate,
    EntryPage,
    EntryUpdate,
    InviteInfo,
    InvitePreview,
    InviteState,
    MemberList,
    MemberOperate,
    MemberRoleUpdate,
    UuidText,
    WalletCreate,
    WalletInfo,
    WalletList,
    WalletOperate,
    WalletUpdate,
)

# 每條路由都只要求登入, 不要求任何全站權限: 錢包裡能做什麼由成員角色決定 (見 access.py)。
router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.post("/")
async def create_wallet_route(
    form_data: WalletCreate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletOperate:
    """建立錢包, 建立者成為管理者。一般錢包會依請求的語系附上預設分類。"""
    return await service.create_wallet(form_data, current_user)


@router.get("/")
async def get_wallet_list_route(
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletList:
    """自己加入的錢包。"""
    return await service.list_wallets(current_user)


@router.get("/{id}")
async def get_wallet_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletInfo:
    return await service.get_wallet(id, current_user)


@router.patch("/{id}")
async def update_wallet_route(
    id: UuidText,
    form_data: WalletUpdate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletOperate:
    """修改錢包設定。`kind` 必須與錢包目前的類型相同。"""
    return await service.update_wallet(id, form_data, current_user)


@router.delete("/{id}")
async def delete_wallet_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletOperate:
    """永久刪除錢包, 連同成員與分類。"""
    return await service.delete_wallet(id, current_user)


@router.get("/{id}/members")
async def get_member_list_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> MemberList:
    return await members.list_members(id, current_user)


@router.patch("/{id}/members/{user_id}")
async def update_member_role_route(
    id: UuidText,
    user_id: UuidText,
    form_data: MemberRoleUpdate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> MemberOperate:
    """把成員升為管理者, 或把管理者降為成員。"""
    return await members.update_member_role(id, user_id, form_data, current_user)


@router.delete("/{id}/members/{user_id}")
async def remove_member_route(
    id: UuidText,
    user_id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> MemberOperate:
    """移除成員。`user_id` 是自己時就是離開錢包。"""
    return await members.remove_member(id, user_id, current_user)


@router.get("/{id}/categories")
async def get_category_list_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> CategoryList:
    return await categories.list_categories(id, current_user)


@router.post("/{id}/categories")
async def create_category_route(
    id: UuidText,
    form_data: CategoryCreate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> CategoryOperate:
    return await categories.create_category(id, form_data, current_user)


@router.patch("/{id}/categories/{category_id}")
async def rename_category_route(
    id: UuidText,
    category_id: UuidText,
    form_data: CategoryRename,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> CategoryOperate:
    return await categories.rename_category(id, category_id, form_data, current_user)


@router.delete("/{id}/categories/{category_id}")
async def archive_category_route(
    id: UuidText,
    category_id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> CategoryOperate:
    """刪除分類。分類會被封存: 不再出現在清單上, 舊帳仍顯示原本的名稱。"""
    return await categories.archive_category(id, category_id, current_user)


# 「載入更多」一次取的筆數。
PageLimit = Annotated[int, Query(ge=1, le=100)]
PageCursor = Annotated[str | None, Query(max_length=500)]


@router.get("/{id}/entries")
async def get_entry_list_route(
    id: UuidText,
    limit: PageLimit = 20,
    cursor: PageCursor = None,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryPage:
    """一般錢包的帳目, 日期新到舊、同一天依記帳時間新到舊。下一頁帶上一頁的 `next_cursor`。"""
    return await entries.list_entries(id, current_user, limit=limit, cursor=cursor)


@router.post("/{id}/entries")
async def create_entry_route(
    id: UuidText,
    form_data: EntryCreate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryOperate:
    """記一筆收入或支出, 餘額隨即更新。"""
    return await entries.create_entry(id, form_data, current_user)


@router.post("/{id}/adjustments")
async def adjust_balance_route(
    id: UuidText,
    form_data: BalanceAdjust,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryOperate:
    """把餘額調整成實際餘額, 記成一筆差額。餘額沒有變化時回 400。"""
    return await entries.adjust_balance(id, form_data, current_user)


@router.patch("/{id}/entries/{entry_id}")
async def update_entry_route(
    id: UuidText,
    entry_id: UuidText,
    form_data: EntryUpdate,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryOperate:
    """修改自己記的收入或支出; 錢包管理者可以修改任何人的。調整不能修改。"""
    return await entries.update_entry(id, entry_id, form_data, current_user)


@router.delete("/{id}/entries/{entry_id}")
async def delete_entry_route(
    id: UuidText,
    entry_id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryOperate:
    """刪除自己記的帳; 錢包管理者可以刪除任何人的。餘額反向套用。"""
    return await entries.delete_entry(id, entry_id, current_user)


@router.get("/{id}/entries/{entry_id}/logs")
async def get_entry_log_list_route(
    id: UuidText,
    entry_id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryLogList:
    """一筆帳的異動紀錄, 新到舊。已刪除的帳也查得到。"""
    return await entry_logs.list_entry_logs(id, entry_id, current_user)


@router.get("/{id}/entry-logs")
async def get_wallet_entry_log_list_route(
    id: UuidText,
    limit: PageLimit = 20,
    cursor: PageCursor = None,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> EntryLogPage:
    """整個錢包的帳目異動紀錄, 新到舊, 包含已刪除的帳。"""
    return await entry_logs.list_wallet_logs(id, current_user, limit=limit, cursor=cursor)


@router.get("/{id}/invite")
async def get_invite_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> InviteState:
    """目前有效的邀請連結。只有錢包管理者看得到。"""
    return await invites.get_invite(id, current_user)


@router.post("/{id}/invite")
async def create_invite_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> InviteInfo:
    """產生邀請連結, 有效期限一天。已經有連結時換成新的, 舊的立即失效。"""
    return await invites.create_invite(id, current_user)


@router.delete("/{id}/invite")
async def revoke_invite_route(
    id: UuidText,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletOperate:
    """撤銷邀請連結。"""
    return await invites.revoke_invite(id, current_user)


# 拿到邀請連結的人用的: 他還不是成員, 所以不能掛在 `/wallets/{id}` 底下 (那裡一律先檢查成員)。
invite_router = APIRouter(prefix="/invites", tags=["wallet-invites"])
InviteToken = Annotated[str, Path(max_length=64)]


@invite_router.get("/{token}")
async def get_invite_preview_route(
    token: InviteToken,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> InvitePreview:
    """邀請連結要加入的錢包。連結無效、過期或已撤銷時回 404。"""
    return await invites.preview_invite(token, current_user)


@invite_router.post("/{token}/accept")
async def accept_invite_route(
    token: InviteToken,
    current_user: CurrentUser = Depends(check_user_permission()),
) -> WalletOperate:
    """以成員身分加入錢包。已經是成員時角色不變。"""
    return await invites.accept_invite(token, current_user)


# 後台只開放給超級管理者。查看單一錢包、修改、刪除、成員與分類沿用上面的端點
# (超級管理者對任何錢包等同管理者), 這裡只有一般端點做不到的列出全部與替別人建立。
admin_router = APIRouter(prefix="/admin/wallets", tags=["admin-wallets"])


@admin_router.get("/")
async def get_all_wallet_list_route(
    pagination: Annotated[PaginationParams, Depends()],
    name: str | None = Query(default=None),
    kind: WalletKind | None = Query(default=None),
    _: CurrentUser = Depends(check_user_permission(Permission.ALL)),
) -> AdminWalletList:
    """所有錢包, 不論自己有沒有加入。`name` 是名稱的部分比對。"""
    return await admin.list_all_wallets(**pagination.model_dump(), name=name, kind=kind)


@admin_router.post("/")
async def create_wallet_for_user_route(
    form_data: AdminWalletCreate,
    _: CurrentUser = Depends(check_user_permission(Permission.ALL)),
) -> WalletOperate:
    """建立錢包並指定一位啟用中的使用者當唯一的管理者; 沒指定自己時, 自己不會成為成員。"""
    return await admin.create_wallet_for(form_data)
