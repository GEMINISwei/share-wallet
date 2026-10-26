from shared.module import ModuleManifest

from .model import (
    TravelExpenseShareTable,
    TravelExpenseTable,
    TravelSettlementTransferTable,
    WalletAdvanceTargetTable,
    WalletCategoryTable,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletGroupTable,
    WalletInviteTable,
    WalletMemberTable,
    WalletTable,
)
from .router import admin_router, group_router, invite_router, router

# 沒有 permissions: 錢包功能不設全站權限 (見 docs/features.md〈不設全站權限〉);
# 後台的端點跟 users、roles 一樣只開放給超級管理者 (`Permission.ALL`)。
MODULE = ModuleManifest(
    name="wallets",
    routers=(router, admin_router, group_router, invite_router),
    tables=(
        WalletTable,
        WalletGroupTable,
        WalletMemberTable,
        WalletCategoryTable,
        WalletInviteTable,
        WalletEntryTable,
        WalletEntryLogTable,
        WalletAdvanceTargetTable,
        TravelExpenseTable,
        TravelExpenseShareTable,
        TravelSettlementTransferTable,
    ),
)
