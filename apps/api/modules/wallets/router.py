from fastapi import APIRouter, Depends

from shared.auth.contracts import CurrentUser
from shared.auth.dependency import check_user_permission

from . import categories, members, service
from .schema import (
    CategoryCreate,
    CategoryList,
    CategoryOperate,
    CategoryRename,
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
