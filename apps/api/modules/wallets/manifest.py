from shared.module import ModuleManifest

from .model import WalletCategoryTable, WalletMemberTable, WalletTable
from .router import router

# 沒有 permissions: 錢包功能不設全站權限 (見 docs/features.md〈不設全站權限〉)。
MODULE = ModuleManifest(
    name="wallets",
    routers=(router,),
    tables=(WalletTable, WalletMemberTable, WalletCategoryTable),
)
